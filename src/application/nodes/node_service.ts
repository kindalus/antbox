import { NodeFactory } from "domain/node_factory.ts";
import type { AspectableNode, NodeLike } from "domain/node_like.ts";
import { FolderNotFoundError } from "domain/nodes/folder_not_found_error.ts";

import { Node } from "domain/nodes/node.ts";
import { NodeCreatedEvent } from "domain/nodes/node_created_event.ts";
import { NodeDeletedEvent } from "domain/nodes/node_deleted_event.ts";
import type { NodeFilters } from "domain/nodes/node_filter.ts";
import { NodeUpdateChanges, NodeUpdatedEvent } from "domain/nodes/node_updated_event.ts";

import type { AuthenticationContext } from "../security/authentication_context.ts";

import type { NodeMetadata } from "domain/nodes/node_metadata.ts";
import { NodeFileNotFoundError } from "domain/nodes/node_file_not_found_error.ts";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";
import type { NodeFilterResult } from "domain/nodes/node_repository.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { SmartFolderNode } from "domain/nodes/smart_folder_node.ts";
import { SmartFolderNodeNotFoundError } from "domain/nodes/smart_folder_node_not_found_error.ts";
import { NodesFilters } from "domain/nodes_filters.ts";
import { Groups } from "domain/users_groups/groups.ts";
import { Users } from "domain/users_groups/users.ts";
import { AntboxError, BadRequestError, ForbiddenError, UnknownError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import { FidGenerator } from "shared/fid_generator.ts";
import { UuidGenerator } from "shared/uuid_generator.ts";
import { AuthorizationService } from "../security/authorization_service.ts";
import { FindService } from "./find_service.ts";
import type { NodeServiceContext } from "./node_service_context.ts";

import { NodeAspectRules } from "./node_aspect_rules.ts";
import { NodeLocking } from "./node_locking.ts";
import { NodeLookup } from "./node_lookup.ts";
import { ParentFolderUpdateHandler } from "./parent_folder_update_handler.ts";
import { calculateNodeUpdateChanges } from "./node_update_changes.ts";

interface NodeUpdateOptions {
	forceEvent?: boolean;
}

/** Coordinates node persistence, storage, authorization, validation, and events. */
export class NodeService {
	private readonly parentFolderUpdateHandler: ParentFolderUpdateHandler;
	private readonly authorizationService: AuthorizationService;
	private readonly findService: FindService;
	private readonly nodeAspectRules: NodeAspectRules;
	private readonly nodeLocking: NodeLocking;
	private readonly nodeLookup: NodeLookup;

	constructor(private readonly context: NodeServiceContext) {
		this.authorizationService = new AuthorizationService();
		this.findService = new FindService(this.context, this.authorizationService);
		this.nodeLookup = new NodeLookup(context.repository);
		this.nodeLocking = new NodeLocking(
			context.repository,
			this.nodeLookup,
			this.authorizationService,
		);
		this.nodeAspectRules = new NodeAspectRules(
			context.configRepo,
			(uuid) => this.nodeLookup.get(uuid),
		);

		this.parentFolderUpdateHandler = new ParentFolderUpdateHandler(this.context);

		this.context.bus.subscribe(NodeCreatedEvent.EVENT_ID, this.parentFolderUpdateHandler);
		this.context.bus.subscribe(NodeUpdatedEvent.EVENT_ID, this.parentFolderUpdateHandler);
		this.context.bus.subscribe(NodeDeletedEvent.EVENT_ID, this.parentFolderUpdateHandler);
	}

	async copy(
		ctx: AuthenticationContext,
		uuid: string,
		parent: string,
	): Promise<Either<AntboxError, Node>> {
		return this.#copyNode(ctx, uuid, parent);
	}

	async #createNodeInRepository(
		ctx: AuthenticationContext,
		metadata: Partial<NodeMetadata>,
	): Promise<Either<AntboxError, NodeLike>> {
		metadata = { ...metadata };
		if (ctx.principal.email !== Users.WORKFLOW_INSTANCE_USER_EMAIL) {
			delete metadata.workflowInstanceUuid;
			delete metadata.workflowState;
		}

		const uuid = metadata.uuid ?? UuidGenerator.generate();

		if (!metadata.parent) {
			return left(new BadRequestError("Parent is required"));
		}

		const parentOrErr = await this.nodeLookup.getFolder(
			metadata.parent,
		);
		if (parentOrErr.isLeft()) {
			return left(parentOrErr.value);
		}

		const group = metadata.group ?? ctx.principal.groups[0];

		const nodeOrErr = NodeFactory.from({
			...metadata,
			uuid,
			fid: metadata.fid ?? FidGenerator.generate(metadata.title ?? ""),
			owner: metadata.owner ?? ctx.principal.email,
			group: group === Groups.ANONYMOUS_GROUP_UUID ? parentOrErr.value.group : group,
		});

		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}

		const allowedOrErr = this.authorizationService.isPrincipalAllowedTo(
			ctx,
			parentOrErr.value,
			"Write",
		);
		if (allowedOrErr.isLeft()) {
			return left(allowedOrErr.value);
		}

		if (Nodes.isFolder(nodeOrErr.value) && !metadata.permissions) {
			nodeOrErr.value.update({ permissions: parentOrErr.value.permissions });
		}

		const aspectValidation = await this.nodeAspectRules.validateAndUpdate(nodeOrErr.value);
		if (aspectValidation.isLeft()) {
			return left(aspectValidation.value);
		}

		const filtersSatisfied = NodesFilters.satisfiedBy(
			parentOrErr.value.filters,
			nodeOrErr.value,
		);
		if (filtersSatisfied.isLeft()) {
			return left(
				new BadRequestError(`Node does not satisfy parent filters: ${filtersSatisfied.value}`),
			);
		}

		nodeOrErr.value.update({
			fulltext: await this.#calculateFulltext(nodeOrErr.value),
		});

		const voidOrErr = await this.context.repository.add(nodeOrErr.value);
		if (voidOrErr.isLeft()) {
			return left(voidOrErr.value);
		}

		return right(nodeOrErr.value);
	}

	async create(
		ctx: AuthenticationContext,
		metadata: Partial<NodeMetadata>,
	): Promise<Either<AntboxError, NodeMetadata>> {
		const nodeOrErr = await this.#createNodeInRepository(ctx, metadata);

		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}

		if (Nodes.isFolder(nodeOrErr.value)) {
			const mkdirOrErr = await this.context.storage.mkdir(nodeOrErr.value.uuid, {
				title: nodeOrErr.value.title,
				parent: nodeOrErr.value.parent,
			});
			if (mkdirOrErr.isLeft()) {
				await this.context.repository.delete(nodeOrErr.value.uuid);
				return left(mkdirOrErr.value);
			}
		}

		// Publish NodeCreatedEvent
		const evt = new NodeCreatedEvent(ctx.principal.email, ctx.tenant, nodeOrErr.value.metadata);
		this.context.bus.publish(evt);

		return right(nodeOrErr.value.metadata);
	}

	async createFile(
		ctx: AuthenticationContext,
		file: File,
		metadata: Partial<NodeMetadata>,
	): Promise<Either<AntboxError, NodeMetadata>> {
		const fileType = file.type === "text/javascript" ? "application/javascript" : file.type;
		const requestedType = metadata.mimetype === "text/javascript"
			? "application/javascript"
			: metadata.mimetype;

		const fileMetadata = {
			...metadata,
			title: metadata.title ?? file.name,
			fid: metadata.fid ?? FidGenerator.generate(metadata.title ?? file.name),
			mimetype: fileType || requestedType,
			size: file.size,
		};

		const limitsOrErr = await this.context.tenantLimitsGuard?.ensureCanCreateFile(file.size) ??
			right(undefined);
		if (limitsOrErr.isLeft()) {
			return left(limitsOrErr.value);
		}

		const nodeOrErr = await this.#createNodeInRepository(ctx, fileMetadata);

		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}

		const voidOrErr = await this.context.storage.write(nodeOrErr.value.uuid, file, {
			title: nodeOrErr.value.title,
			parent: nodeOrErr.value.parent,
			mimetype: nodeOrErr.value.mimetype,
		});
		if (voidOrErr.isLeft()) {
			this.context.repository.delete(nodeOrErr.value.uuid);
			return left(voidOrErr.value);
		}

		if (this.context.storage.provideCDN()) {
			const cdnUrl = this.context.storage.getCDNUrl(nodeOrErr.value.uuid);
			if (cdnUrl) {
				nodeOrErr.value.update({ cdnUrl });
				await this.context.repository.update(nodeOrErr.value);
			}
		}

		// Publish NodeCreatedEvent
		const evt = new NodeCreatedEvent(ctx.principal.email, ctx.tenant, nodeOrErr.value);
		this.context.bus.publish(evt);

		return nodeOrErr;
	}

	async delete(
		ctx: AuthenticationContext,
		uuid: string,
	): Promise<Either<AntboxError, void>> {
		const nodeOrErr = await this.nodeLookup.getStored(uuid);
		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}

		// Prevent deletion of nodes involved in a workflow
		if (nodeOrErr.value.metadata.workflowInstanceUuid) {
			return left(
				new BadRequestError(
					"Cannot delete node involved in a workflow instance. Cancel or complete the workflow first.",
				),
			);
		}

		const parentOrErr = await this.nodeLookup.getFolder(
			nodeOrErr.value.parent,
		);
		if (parentOrErr.isLeft()) {
			return left(
				new UnknownError(`Parent folder not found for node uuid='${uuid}'`),
			);
		}

		const allowedOrErr = this.authorizationService.isPrincipalAllowedTo(
			ctx,
			parentOrErr.value,
			"Write",
		);
		if (allowedOrErr.isLeft()) {
			return left(allowedOrErr.value);
		}

		if (Nodes.isFileLike(nodeOrErr.value)) {
			const voidOrErr = await this.context.storage.delete(uuid);
			if (voidOrErr.isLeft() && !this.#isStorageNotFound(voidOrErr.value)) {
				return left(voidOrErr.value);
			}
		}

		if (!Nodes.isFolder(nodeOrErr.value)) {
			const v = await this.context.repository.delete(uuid);
			if (v.isRight()) {
				const evt = new NodeDeletedEvent(
					ctx.principal.email,
					ctx.tenant,
					nodeOrErr.value.metadata,
				);
				this.context.bus.publish(evt);
			}
			return v;
		}

		const children = await this.nodeLookup.listChildren(uuid);

		for (const child of children) {
			try {
				const childDeleteOrErr = await this.delete(ctx, child.uuid);
				if (childDeleteOrErr.isLeft()) {
					return left(childDeleteOrErr.value);
				}
			} catch (error) {
				return left(
					new UnknownError(
						`Error deleting child ${child.uuid}: ${(error as Error).message}`,
					),
				);
			}
		}

		const storageDeleteOrErr = await this.context.storage.rmdir(uuid);
		if (storageDeleteOrErr.isLeft() && !this.#isStorageNotFound(storageDeleteOrErr.value)) {
			return left(storageDeleteOrErr.value);
		}

		const v = await this.context.repository.delete(uuid);

		if (v.isRight()) {
			const evt = new NodeDeletedEvent(
				ctx.principal.email,
				ctx.tenant,
				nodeOrErr.value.metadata,
			);
			this.context.bus.publish(evt);
		}

		return v;
	}

	#isStorageNotFound(error: unknown): boolean {
		return error instanceof NodeNotFoundError || error instanceof NodeFileNotFoundError;
	}

	async duplicate(
		ctx: AuthenticationContext,
		uuid: string,
	): Promise<Either<NodeNotFoundError, Node>> {
		return this.#copyNode(ctx, uuid) as Promise<Either<NodeNotFoundError, Node>>;
	}

	async #copyNode(
		ctx: AuthenticationContext,
		uuid: string,
		parent?: string,
	): Promise<Either<AntboxError, Node>> {
		const nodeOrErr = await this.nodeLookup.get(uuid);
		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}

		const node = nodeOrErr.value;
		if (Nodes.isFolder(node)) {
			return left(new BadRequestError("Cannot copy folder"));
		}

		const metadata = {
			...node.metadata,
			uuid: UuidGenerator.generate(),
			title: `${node.title} 2`,
			parent: parent ?? node.parent,
		};
		delete (metadata as Partial<NodeMetadata>).fid;

		if (!Nodes.isFileLike(node)) {
			return this.create(ctx, metadata) as Promise<Either<AntboxError, Node>>;
		}

		const fileOrErr = await this.context.storage.read(node.uuid);
		if (fileOrErr.isLeft()) {
			return left(fileOrErr.value);
		}

		return this.createFile(ctx, fileOrErr.value, metadata) as Promise<Either<AntboxError, Node>>;
	}

	async export(
		ctx: AuthenticationContext,
		uuid: string,
	): Promise<Either<NodeNotFoundError, File>> {
		const nodeOrErr = await this.nodeLookup.getStored(uuid);
		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}

		const parentOrErr = await this.nodeLookup.getFolder(
			nodeOrErr.value.parent,
		);
		if (parentOrErr.isLeft()) {
			return left(
				new UnknownError(`Parent folder not found for node uuid='${uuid}'`),
			);
		}

		const allowedOrErr = this.authorizationService.isPrincipalAllowedTo(
			ctx,
			parentOrErr.value,
			"Export",
		);
		if (allowedOrErr.isLeft()) {
			return left(allowedOrErr.value);
		}

		const fileOrErr = await this.context.storage.read(nodeOrErr.value.uuid);
		if (fileOrErr.isLeft()) {
			return left(fileOrErr.value);
		}

		const type = this.#mapAntboxMimetypes(nodeOrErr.value.mimetype);
		return right(
			new File([fileOrErr.value], nodeOrErr.value.title, { type }),
		);
	}

	async evaluate(
		ctx: AuthenticationContext,
		uuid: string,
	): Promise<Either<SmartFolderNodeNotFoundError, NodeMetadata[]>> {
		const nodeOrErr = await this.nodeLookup.get(uuid);
		if (nodeOrErr.isLeft()) {
			return left(new SmartFolderNodeNotFoundError(uuid));
		}

		if (!Nodes.isSmartFolder(nodeOrErr.value)) {
			return left(new SmartFolderNodeNotFoundError(uuid));
		}

		const node: SmartFolderNode = nodeOrErr.value;
		const evaluationOrErr = await this.find(
			ctx,
			node.filters,
			Number.MAX_SAFE_INTEGER,
		);
		if (evaluationOrErr.isLeft()) {
			return left(
				new UnknownError(
					`Error evaluating smart folder uuid='${uuid}:: ${evaluationOrErr.value}`,
				),
			);
		}

		return right(evaluationOrErr.value.nodes.map((n) => n.metadata));
	}

	/**
	 * Finds nodes based on filters, with support for semantic search and permission checks.
	 * This method delegates to the FindService for all finding logic.
	 *
	 * @param ctx - Authentication context for permission checks
	 * @param filters - NodeFilters (structured) or string (for parsing/content search)
	 * @param pageSize - Number of results per page (default: 20)
	 * @param pageToken - Page number for pagination (default: 1)
	 * @returns Either an error or the filtered node results with pagination info.
	 *          When semantic search is used (filters starting with "?"), the result
	 *          includes a `scores` map of UUID to relevance score (0-1).
	 */
	async find(
		ctx: AuthenticationContext,
		filters: NodeFilters | string,
		pageSize = 20,
		pageToken = 1,
	): Promise<
		Either<
			AntboxError,
			NodeFilterResult & { scores?: Record<string, number> }
		>
	> {
		return this.findService.find(ctx, filters, pageSize, pageToken);
	}

	async getEmbeddingContents(
		ctx: AuthenticationContext,
		uuids: string[],
	): Promise<Either<AntboxError, Record<string, string>>> {
		const uniqueUuids = [...new Set(uuids)];
		const accessibleNodeResults = await Promise.all(
			uniqueUuids.map((uuid) => this.get(ctx, uuid)),
		);

		const permittedUuids = accessibleNodeResults
			.filter((nodeOrErr) => nodeOrErr.isRight())
			.map((nodeOrErr) => nodeOrErr.value.uuid);

		return this.context.repository.getEmbeddingContents(permittedUuids);
	}

	async get(
		ctx: AuthenticationContext,
		uuid: string,
	): Promise<Either<NodeNotFoundError, NodeMetadata>> {
		const nodeOrErr = await this.nodeLookup.get(uuid);
		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}

		if (Nodes.isFolder(nodeOrErr.value)) {
			const allowedOrErr = this.authorizationService.isPrincipalAllowedTo(
				ctx,
				nodeOrErr.value,
				"Read",
			);
			if (allowedOrErr.isLeft()) {
				return left(allowedOrErr.value);
			}
		}

		const parentOrErr = await this.nodeLookup.getFolder(
			nodeOrErr.value.parent,
		);
		if (parentOrErr.isLeft()) {
			return left(
				new UnknownError(
					`Parent folder uuid='${nodeOrErr.value.parent}' not found for node uuid='${uuid}' `,
				),
			);
		}

		const allowedOrErr = this.authorizationService.isPrincipalAllowedTo(
			ctx,
			parentOrErr.value,
			"Read",
		);
		if (allowedOrErr.isLeft()) {
			return left(allowedOrErr.value);
		}

		return right(nodeOrErr.value.metadata);
	}

	async list(
		ctx: AuthenticationContext,
		parent = Nodes.ROOT_FOLDER_UUID,
	): Promise<Either<FolderNotFoundError | ForbiddenError, NodeMetadata[]>> {
		const [parentOrErr, nodeOrErr] = await Promise.all([
			this.nodeLookup.getFolder(parent),
			this.nodeLookup.getStored(parent),
		]);

		if (
			parentOrErr.isLeft() && nodeOrErr.isRight() &&
			Nodes.isSmartFolder(nodeOrErr.value)
		) {
			return this.evaluate(ctx, parent);
		}

		if (parentOrErr.isLeft()) {
			return left(parentOrErr.value);
		}

		const allowedOrErr = this.authorizationService.isPrincipalAllowedTo(
			ctx,
			parentOrErr.value,
			"Read",
		);
		if (allowedOrErr.isLeft()) {
			return left(allowedOrErr.value);
		}

		const nodesOrErr = await this.find(
			ctx,
			[["parent", "==", parentOrErr.value.uuid]],
			Number.MAX_SAFE_INTEGER,
			1,
		);

		if (nodesOrErr.isLeft()) {
			return left(nodesOrErr.value);
		}

		const nodes = nodesOrErr.value.nodes;

		nodes.sort((a, b) => {
			if (Nodes.isFolderLike(a) && Nodes.isFolderLike(b)) {
				return a.title.localeCompare(b.title);
			}

			if (Nodes.isFolderLike(a)) {
				return -1;
			}

			if (Nodes.isFolderLike(b)) {
				return 1;
			}

			return a.title.localeCompare(b.title);
		});

		return right(nodes.map((n) => n.metadata));
	}

	async breadcrumbs(
		ctx: AuthenticationContext,
		uuid: string,
	): Promise<Either<AntboxError, Array<{ uuid: string; title: string }>>> {
		const nodeOrErr = await this.get(ctx, uuid);
		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}

		const breadcrumbs: Array<{ uuid: string; title: string }> = [{
			uuid: nodeOrErr.value.uuid,
			title: nodeOrErr.value.title,
		}];

		let currentUuid = nodeOrErr.value.parent;

		// Traverse up the folder hierarchy
		while (currentUuid && currentUuid !== Nodes.ROOT_FOLDER_UUID) {
			const currentNodeOrErr = await this.get(ctx, currentUuid);

			if (currentNodeOrErr.isLeft()) {
				return left(currentNodeOrErr.value);
			}

			const currentNode = currentNodeOrErr.value;
			breadcrumbs.unshift({
				uuid: currentNode.uuid,
				title: currentNode.title,
			});

			currentUuid = currentNode.parent;
		}

		if (breadcrumbs[0].uuid !== Nodes.ROOT_FOLDER_UUID) {
			breadcrumbs.unshift({
				uuid: Nodes.ROOT_FOLDER_UUID,
				title: "Root",
			});
		}

		return right(breadcrumbs);
	}

	async update(
		ctx: AuthenticationContext,
		uuid: string,
		metadata: Partial<NodeMetadata>,
		options: NodeUpdateOptions = {},
	): Promise<Either<NodeNotFoundError, void>> {
		let nodeOrErr = await this.nodeLookup.get(uuid);
		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}

		const currentMetadata = nodeOrErr.value.metadata;

		// Get current parent for permission check
		const currentParentOrErr = await this.nodeLookup.getFolder(
			nodeOrErr.value.parent,
		);

		if (currentParentOrErr.isLeft()) {
			return left(
				new UnknownError(`Parent folder not found for node uuid='${uuid}'`),
			);
		}

		const allowedOrErr = this.authorizationService.isPrincipalAllowedTo(
			ctx,
			currentParentOrErr.value,
			"Write",
		);
		if (allowedOrErr.isLeft()) {
			return left(allowedOrErr.value);
		}

		// Check if node is locked
		const lockCheckOrErr = this.nodeLocking.checkModification(ctx, nodeOrErr.value);
		if (lockCheckOrErr.isLeft()) {
			return left(lockCheckOrErr.value);
		}

		// Check if node is involved in a workflow
		// Only workflow-instance user can modify nodes in a workflow
		if (nodeOrErr.value.metadata.workflowInstanceUuid) {
			if (ctx.principal.email !== Users.WORKFLOW_INSTANCE_USER_EMAIL) {
				return left(
					new BadRequestError(
						"Cannot modify node involved in a workflow instance. Use workflow transitions to modify.",
					),
				);
			}
		}

		if (Nodes.isFileLike(nodeOrErr.value)) {
			const newNodeOrErr = NodeFactory.from({
				...nodeOrErr.value.metadata,
				...(metadata.size !== undefined ? { size: metadata.size } : {}),
			});
			if (newNodeOrErr.isLeft()) {
				return left(newNodeOrErr.value);
			}
			nodeOrErr = newNodeOrErr;
		}

		let safeMetadata: Partial<NodeMetadata> = metadata;

		// Merge properties to avoid accidentally dropping unspecified properties
		if (safeMetadata.properties && Nodes.hasAspects(nodeOrErr.value)) {
			const currentProperties = (nodeOrErr.value as AspectableNode).properties || {};
			safeMetadata = {
				...safeMetadata,
				properties: { ...currentProperties, ...safeMetadata.properties },
			};
		}

		safeMetadata = await this.nodeAspectRules.filterReadonly(nodeOrErr.value, safeMetadata);

		if (ctx.principal.email !== Users.WORKFLOW_INSTANCE_USER_EMAIL) {
			delete safeMetadata.workflowInstanceUuid;
			delete safeMetadata.workflowState;
		}

		const changesOrErr = calculateNodeUpdateChanges(currentMetadata, safeMetadata);
		if (changesOrErr.isLeft()) {
			return left(changesOrErr.value);
		}

		const updateChanges = changesOrErr.value;
		const hasChangedValues = Object.keys(updateChanges.changed.newValues).length > 0;
		if (!hasChangedValues && !options.forceEvent) {
			return right(undefined);
		}

		const eventValues = hasChangedValues ? updateChanges.changed : updateChanges.requested;

		const voidOrErr = nodeOrErr.value.update(safeMetadata);
		if (voidOrErr.isLeft()) {
			return left(voidOrErr.value);
		}

		const aspectValidation = await this.nodeAspectRules.validateAndUpdate(nodeOrErr.value);
		if (aspectValidation.isLeft()) {
			return left(aspectValidation.value);
		}

		// Get the actual parent (which might be different if parent was updated)
		const actualParentOrErr = await this.nodeLookup.getFolder(
			nodeOrErr.value.parent,
		);
		if (actualParentOrErr.isLeft()) {
			return left(
				new BadRequestError(`Parent folder not found: ${nodeOrErr.value.parent}`),
			);
		}

		const filtersSatisfied = NodesFilters.satisfiedBy(
			actualParentOrErr.value.filters,
			nodeOrErr.value,
		).isRight();
		if (!filtersSatisfied) {
			return left(new BadRequestError("Node does not satisfy parent filters"));
		}

		// If updating a folder's filters, validate all existing children against new filters
		if (Nodes.isFolder(nodeOrErr.value) && metadata.filters !== undefined) {
			const children = await this.context.repository.filter([[
				"parent",
				"==",
				uuid,
			]]);

			for (const child of children.nodes) {
				const childFiltersSatisfied = NodesFilters.satisfiedBy(
					nodeOrErr.value.filters,
					child,
				).isRight();
				if (!childFiltersSatisfied) {
					return left(
						new BadRequestError(
							"Updated filters would make existing child node invalid",
						),
					);
				}
			}
		}

		nodeOrErr.value.update({
			fulltext: await this.#calculateFulltext(nodeOrErr.value),
		});

		const updateResult = await this.context.repository.update(nodeOrErr.value);

		if (updateResult.isRight()) {
			// Create NodeUpdateChanges with old and new values
			const changes: NodeUpdateChanges = {
				uuid: nodeOrErr.value.uuid,
				oldValues: eventValues.oldValues,
				newValues: eventValues.newValues,
			};

			// Publish NodeUpdatedEvent
			const evt = new NodeUpdatedEvent(
				ctx.principal.email,
				ctx.tenant,
				changes,
			);
			this.context.bus.publish(evt);
		}

		return updateResult;
	}

	async updateFile(
		ctx: AuthenticationContext,
		uuid: string,
		file: File,
	): Promise<Either<NodeNotFoundError, void>> {
		const nodeOrErr = await this.nodeLookup.get(uuid);
		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}

		if (!Nodes.isFileLike(nodeOrErr.value)) {
			return left(new NodeNotFoundError(uuid));
		}

		const mappedMimetype = this.#mapAntboxMimetypes(nodeOrErr.value.mimetype);
		if (
			mappedMimetype !== file.type && !mappedMimetype.endsWith("/javascript") &&
			!file.type.endsWith("/javascript")
		) {
			return left(
				new BadRequestError(
					`Mimetype mismatch ${mappedMimetype} vs ${file.type}`,
				),
			);
		}

		const limitsOrErr = await this.context.tenantLimitsGuard?.ensureCanUpdateFile(
			nodeOrErr.value.size ?? 0,
			file.size,
		) ?? right(undefined);
		if (limitsOrErr.isLeft()) {
			return left(limitsOrErr.value);
		}

		const writeOrErr = await this.context.storage.write(uuid, file, {
			title: nodeOrErr.value.title,
			parent: nodeOrErr.value.parent,
			mimetype: nodeOrErr.value.mimetype,
		});
		if (writeOrErr.isLeft()) {
			return left(writeOrErr.value);
		}

		const updateMetadata: Partial<NodeMetadata> = { size: file.size };

		if (this.context.storage.provideCDN()) {
			const cdnUrl = this.context.storage.getCDNUrl(uuid);
			if (cdnUrl) {
				updateMetadata.cdnUrl = cdnUrl;
			}
		}

		return this.update(ctx, uuid, updateMetadata, { forceEvent: true });
	}

	async lock(
		ctx: AuthenticationContext,
		uuid: string,
		unlockAuthorizedGroups: string[] = [],
	): Promise<Either<AntboxError, void>> {
		return this.nodeLocking.lock(ctx, uuid, unlockAuthorizedGroups);
	}

	async unlock(
		ctx: AuthenticationContext,
		uuid: string,
	): Promise<Either<AntboxError, void>> {
		return this.nodeLocking.unlock(ctx, uuid);
	}

	async #calculateFulltext(node: NodeLike): Promise<string> {
		const fulltext = [node.title, node.description ?? ""];

		if (
			(Nodes.isFileLike(node) || Nodes.isFolder(node)) &&
			node.tags?.length
		) {
			fulltext.push(...node.tags);
		}

		fulltext.push(...await this.nodeAspectRules.searchableValues(node));

		const parts = fulltext
			.join(" ")
			.toLocaleLowerCase()
			.replace(/[áàâäãå]/g, "a")
			.replace(/[ç]/g, "c")
			.replace(/[éèêë]/g, "e")
			.replace(/[íìîï]/g, "i")
			.replace(/ñ/g, "n")
			.replace(/[óòôöõ]/g, "o")
			.replace(/[úùûü]/g, "u")
			.replace(/[ýÿ]/g, "y")
			.replace(/[\W\._]/g, " ")
			.replace(/(^|\s)\w{1,2}\s/g, " ")
			.replace(/\s+/g, " ")
			.trim()
			.split(" ");

		return Array.from(new Set(parts)).join(" ");
	}

	#mapAntboxMimetypes(mimetype: string): string {
		return mimetype === Nodes.SMART_FOLDER_MIMETYPE ? "application/json" : mimetype;
	}
}
