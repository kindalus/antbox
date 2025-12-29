import { Logger } from "shared/logger.ts";
import { Aspects } from "domain/aspects/aspects.ts";
import type { AspectData, AspectProperty } from "domain/configuration/aspect_data.ts";
import { NodeFactory } from "domain/node_factory.ts";
import type { AspectableNode, NodeLike } from "domain/node_like.ts";
import { FileNode } from "domain/nodes/file_node.ts";
import { FolderNode } from "domain/nodes/folder_node.ts";
import { FolderNotFoundError } from "domain/nodes/folder_not_found_error.ts";

import { MetaNode } from "domain/nodes/meta_node.ts";
import { Node } from "domain/nodes/node.ts";
import { NodeCreatedEvent } from "domain/nodes/node_created_event.ts";
import { NodeDeletedEvent } from "domain/nodes/node_deleted_event.ts";
import {
	isNodeFilters2D,
	type NodeFilter,
	type NodeFilters,
	type NodeFilters2D,
} from "domain/nodes/node_filter.ts";
import { NodeUpdateChanges, NodeUpdatedEvent } from "domain/nodes/node_updated_event.ts";

import type { AuthenticationContext } from "../security/authentication_context.ts";

import type { NodeMetadata } from "domain/nodes/node_metadata.ts";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";
import type { NodeProperties } from "domain/nodes/node_properties.ts";
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
import { Specification, specificationFn } from "shared/specification.ts";
import { UuidGenerator } from "shared/uuid_generator.ts";
import { ValidationError } from "shared/validation_error.ts";
import { AuthorizationService } from "../security/authorization_service.ts";
import { FindService } from "./find_service.ts";
import type { NodeServiceContext } from "./node_service_context.ts";

import { ParentFolderUpdateHandler } from "./parent_folder_update_handler.ts";

// TODO: Implements throwing events

/**
 * The `NodeService` class is responsible for managing raw nodes in the system.
 * It provides functionality for handling nodes without enforcing any specific rules
 * other than ensuring node integrity.
 *
 * Node integrity refers to the basic structural and data consistency of nodes, such as
 * ensuring they have the required properties and relationships.
 *
 * This class serves as a foundational service for working with nodes and can be used
 * in various parts of the application where raw nodes need to be manipulated or
 * processed.
 */
export class NodeService {
	private readonly parentFolderUpdateHandler: ParentFolderUpdateHandler;
	private readonly authorizationService: AuthorizationService;
	private readonly findService: FindService;

	constructor(private readonly context: NodeServiceContext) {
		// Initialize services
		this.authorizationService = new AuthorizationService();
		this.findService = new FindService(this.context, this.authorizationService);

		// Initialize the parent folder update handler
		this.parentFolderUpdateHandler = new ParentFolderUpdateHandler(this.context);

		// Subscribe to node creation, update, and deletion events
		this.context.bus.subscribe(NodeCreatedEvent.EVENT_ID, this.parentFolderUpdateHandler);
		this.context.bus.subscribe(NodeUpdatedEvent.EVENT_ID, this.parentFolderUpdateHandler);
		this.context.bus.subscribe(NodeDeletedEvent.EVENT_ID, this.parentFolderUpdateHandler);
	}

	async copy(
		ctx: AuthenticationContext,
		uuid: string,
		parent: string,
	): Promise<Either<AntboxError, Node>> {
		const nodeOrErr = await this.#getBuiltinNodeOrFromRepository(uuid);
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
			parent,
		};

		delete (metadata as Partial<NodeMetadata>).fid;

		if (!Nodes.isFileLike(node)) {
			return this.create(ctx, metadata) as Promise<Either<AntboxError, Node>>;
		}

		const fileOrErr = await this.context.storage.read(uuid);
		if (fileOrErr.isLeft()) {
			return left(fileOrErr.value);
		}

		return this.createFile(ctx, fileOrErr.value, metadata) as Promise<Either<AntboxError, Node>>;
	}

	async #createNodeInRepository(
		ctx: AuthenticationContext,
		metadata: Partial<NodeMetadata>,
	): Promise<Either<AntboxError, NodeLike>> {
		const uuid = metadata.uuid ?? UuidGenerator.generate();

		if (!metadata.parent) {
			return left(new BadRequestError("Parent is required"));
		}

		const parentOrErr = await this.#getBuiltinFolderOrFromRepository(
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

		if (
			Nodes.isFile(nodeOrErr.value) ||
			Nodes.isFolder(nodeOrErr.value) ||
			Nodes.isMetaNode(nodeOrErr.value)
		) {
			const aspectsOrErr = await this.#getNodeAspects(ctx, nodeOrErr.value);
			if (aspectsOrErr.isLeft()) {
				return left(aspectsOrErr.value);
			}

			const errs = await this.#validateNodeAspectsThenUpdate(
				ctx,
				nodeOrErr.value,
				aspectsOrErr.value,
			);

			if (errs.isLeft()) {
				return left(errs.value);
			}
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
			fulltext: await this.#calculateFulltext(ctx, nodeOrErr.value),
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
	): Promise<Either<NodeNotFoundError, void>> {
		const nodeOrErr = await this.#getFromRepository(uuid);
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

		const parentOrErr = await this.#getBuiltinFolderOrFromRepository(
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
			if (voidOrErr.isLeft()) {
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

		const children = await this.context.repository.filter([[
			"parent",
			"==",
			uuid,
		]]);
		const batch = children.nodes.map((n) => this.delete(ctx, n.uuid));
		const batchResult = await Promise.allSettled(batch);

		const rejected = batchResult.filter((r) => r.status === "rejected");
		if (rejected.length > 0) {
			return left(
				new UnknownError(
					`Error deleting children: ${rejected.map((r) => r.reason)}`,
				),
			);
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

	async duplicate(
		ctx: AuthenticationContext,
		uuid: string,
	): Promise<Either<NodeNotFoundError, Node>> {
		const nodeOrErr = await this.#getBuiltinNodeOrFromRepository(uuid);

		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}

		const node = nodeOrErr.value;

		if (Nodes.isFolder(node)) {
			return left(new BadRequestError("Cannot duplicate folder"));
		}

		const metadata = {
			...node.metadata,
			uuid: UuidGenerator.generate(),
			title: `${node.title} 2`,
		};

		delete (metadata as Partial<NodeMetadata>).fid;

		if (!Nodes.isFileLike(node)) {
			return this.create(ctx, metadata) as Promise<Either<NodeNotFoundError, Node>>;
		}

		const fileOrErr = await this.context.storage.read(uuid);
		if (fileOrErr.isLeft()) {
			return left(fileOrErr.value);
		}

		return this.createFile(ctx, fileOrErr.value, metadata) as Promise<
			Either<NodeNotFoundError, Node>
		>;
	}

	async export(
		ctx: AuthenticationContext,
		uuid: string,
	): Promise<Either<NodeNotFoundError, File>> {
		const nodeOrErr = await this.#getFromRepository(uuid);
		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}

		const parentOrErr = await this.#getBuiltinFolderOrFromRepository(
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

		const fileOrErr = await this.context.storage.read(uuid);
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
		const nodeOrErr = await this.#getBuiltinNodeOrFromRepository(uuid);
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
	 * @returns Either an error or the filtered node results with pagination info
	 */
	async find(
		ctx: AuthenticationContext,
		filters: NodeFilters | string,
		pageSize = 20,
		pageToken = 1,
	): Promise<Either<AntboxError, NodeFilterResult>> {
		return this.findService.find(ctx, filters, pageSize, pageToken);
	}

	async get(
		ctx: AuthenticationContext,
		uuid: string,
	): Promise<Either<NodeNotFoundError, NodeMetadata>> {
		const nodeOrErr = await this.#getBuiltinNodeOrFromRepository(uuid);
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

		const parentOrErr = await this.#getBuiltinFolderOrFromRepository(
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
			this.#getBuiltinFolderOrFromRepository(parent),
			this.#getFromRepository(parent),
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
		_ctx: AuthenticationContext,
		uuid: string,
	): Promise<Either<AntboxError, Array<{ uuid: string; title: string }>>> {
		const nodeOrErr = await this.#getBuiltinNodeOrFromRepository(uuid);
		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}

		const breadcrumbs: Array<{ uuid: string; title: string }> = [{
			uuid: nodeOrErr.value.uuid!,
			title: nodeOrErr.value.title!,
		}];

		let currentUuid = nodeOrErr.value.parent;

		// Traverse up the folder hierarchy
		while (currentUuid && currentUuid !== Nodes.ROOT_FOLDER_UUID) {
			const currentNodeOrErr = await this.#getBuiltinFolderOrFromRepository(currentUuid);

			if (currentNodeOrErr.isLeft()) {
				break;
			}

			const currentNode = currentNodeOrErr.value;
			breadcrumbs.unshift({
				uuid: currentNode.uuid,
				title: currentNode.title,
			});

			currentUuid = currentNode.parent;
		}

		// Add root folder at the beginning if not already there
		if (breadcrumbs.length === 0 || breadcrumbs[0].uuid !== Nodes.ROOT_FOLDER_UUID) {
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
	): Promise<Either<NodeNotFoundError, void>> {
		let nodeOrErr = await this.#getBuiltinNodeOrFromRepository(uuid);
		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}

		const oldValues: Partial<NodeMetadata> = {};
		for (const key in metadata) {
			// deno-lint-ignore no-explicit-any
			(oldValues as any)[key] = (nodeOrErr.value as any)[key];
		}

		// Get current parent for permission check
		const currentParentOrErr = await this.#getBuiltinFolderOrFromRepository(
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
		const lockCheckOrErr = this.#checkNodeLock(ctx, nodeOrErr.value);
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
				size: metadata.size,
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

		safeMetadata = await this.#filterReadonlyProperties(ctx, nodeOrErr.value, safeMetadata);

		const voidOrErr = nodeOrErr.value.update(safeMetadata);
		if (voidOrErr.isLeft()) {
			return left(voidOrErr.value);
		}

		if (
			Nodes.isFile(nodeOrErr.value) ||
			Nodes.isFolder(nodeOrErr.value) ||
			Nodes.isMetaNode(nodeOrErr.value)
		) {
			const aspectsOrErr = await this.#getNodeAspects(ctx, nodeOrErr.value);
			if (aspectsOrErr.isLeft()) {
				return left(aspectsOrErr.value);
			}

			const errs = await this.#validateNodeAspectsThenUpdate(
				ctx,
				nodeOrErr.value,
				aspectsOrErr.value,
			);

			if (errs.isLeft()) {
				return left(errs.value);
			}
		}

		// Get the actual parent (which might be different if parent was updated)
		const actualParentOrErr = await this.#getBuiltinFolderOrFromRepository(
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
			fulltext: await this.#calculateFulltext(ctx, nodeOrErr.value),
		});

		const updateResult = await this.context.repository.update(nodeOrErr.value);

		if (updateResult.isRight()) {
			// Create NodeUpdateChanges with old and new values
			const changes: NodeUpdateChanges = {
				uuid: nodeOrErr.value.uuid,
				oldValues,
				newValues: safeMetadata,
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
		const nodeOrErr = await this.#getBuiltinNodeOrFromRepository(uuid);
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

		await this.context.storage.write(uuid, file, {
			title: nodeOrErr.value.title,
			parent: nodeOrErr.value.parent,
			mimetype: nodeOrErr.value.mimetype,
		});

		const updateMetadata: Partial<NodeMetadata> = { size: file.size };

		if (this.context.storage.provideCDN()) {
			const cdnUrl = this.context.storage.getCDNUrl(uuid);
			if (cdnUrl) {
				updateMetadata.cdnUrl = cdnUrl;
			}
		}

		return this.update(ctx, uuid, updateMetadata);
	}

	async lock(
		ctx: AuthenticationContext,
		uuid: string,
		unlockAuthorizedGroups: string[] = [],
	): Promise<Either<AntboxError, void>> {
		const nodeOrErr = await this.#getFromRepository(uuid);
		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}

		const node = nodeOrErr.value;

		// Check if already locked
		if (node.locked) {
			return left(
				new BadRequestError(
					`Node is already locked by ${node.lockedBy}`,
				),
			);
		}

		// Check write permission on parent
		const parentOrErr = await this.#getBuiltinFolderOrFromRepository(node.parent);
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

		if (!unlockAuthorizedGroups.length) {
			unlockAuthorizedGroups.splice(0, 0, ...ctx.principal.groups);
		}

		// Lock the node
		node.update({
			locked: true,
			lockedBy: ctx.principal.email,
			unlockAuthorizedGroups,
		});

		const updateResult = await this.context.repository.update(node);
		if (updateResult.isLeft()) {
			return left(updateResult.value);
		}

		// If it's a folder, lock all children with LOCK_SYSTEM_USER
		if (Nodes.isFolder(node)) {
			const children = await this.context.repository.filter([[
				"parent",
				"==",
				uuid,
			]]);

			// Create lock-system context
			const lockSystemCtx: AuthenticationContext = {
				tenant: ctx.tenant,
				principal: {
					email: Users.LOCK_SYSTEM_USER_EMAIL,
					groups: [Groups.ADMINS_GROUP_UUID],
				},
				mode: ctx.mode,
			};

			// Lock all children recursively
			for (const child of children.nodes) {
				// Skip if already locked
				if (!child.locked) {
					await this.lock(lockSystemCtx, child.uuid, []);
				}
			}
		}

		return right(undefined);
	}

	async unlock(
		ctx: AuthenticationContext,
		uuid: string,
	): Promise<Either<AntboxError, void>> {
		const nodeOrErr = await this.#getFromRepository(uuid);
		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}

		const node = nodeOrErr.value;

		// Check if node is locked
		if (!node.locked) {
			return left(new BadRequestError("Node is not locked"));
		}

		// Prevent direct unlock of nodes locked by LOCK_SYSTEM_USER
		// These can only be unlocked by unlocking the parent folder
		if (
			node.lockedBy === Users.LOCK_SYSTEM_USER_EMAIL &&
			ctx.principal.email !== Users.LOCK_SYSTEM_USER_EMAIL
		) {
			return left(
				new BadRequestError(
					"Cannot unlock this node directly. It was locked by the system when a parent folder was locked. Unlock the parent folder instead.",
				),
			);
		}

		// Check if user is authorized to unlock
		const canUnlock = this.#canUnlockNode(ctx, node);
		if (!canUnlock) {
			return left(
				new ForbiddenError(),
			);
		}

		// Unlock the node
		node.update({
			locked: false,
			lockedBy: "",
			unlockAuthorizedGroups: [],
		});

		const updateResult = await this.context.repository.update(node);
		if (updateResult.isLeft()) {
			return left(updateResult.value);
		}

		// If it's a folder, unlock all children locked by LOCK_SYSTEM_USER
		if (Nodes.isFolder(node)) {
			const children = await this.context.repository.filter([[
				"parent",
				"==",
				uuid,
			]]);

			// Create lock-system context
			const lockSystemCtx: AuthenticationContext = {
				tenant: ctx.tenant,
				principal: {
					email: Users.LOCK_SYSTEM_USER_EMAIL,
					groups: [Groups.ADMINS_GROUP_UUID],
				},
				mode: ctx.mode,
			};

			// Unlock all children locked by LOCK_SYSTEM_USER recursively
			for (const child of children.nodes) {
				if (child.locked && child.lockedBy === Users.LOCK_SYSTEM_USER_EMAIL) {
					await this.unlock(lockSystemCtx, child.uuid);
				}
			}
		}

		return right(undefined);
	}

	async #calculateFulltext(
		ctx: AuthenticationContext,
		node: NodeLike,
	): Promise<string> {
		const fulltext = [node.title, node.description ?? ""];

		if (
			(Nodes.isFileLike(node) || Nodes.isFolder(node)) &&
			node.tags?.length
		) {
			fulltext.push(...node.tags);
		}

		if (Nodes.hasAspects(node)) {
			const aspectsOrErr = await this.#getNodeAspects(ctx, node);
			if (aspectsOrErr.isRight()) {
				const aspects = aspectsOrErr.value;

				const propertiesFulltext: string[] = aspects
					.map((a) => this.#aspectToProperties(a))
					.flat()
					.filter((p) => p.searchable)
					.map((p) => p.name)
					.map((p) => node.properties[p] as string);

				fulltext.push(...propertiesFulltext);
			}
		}

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

	async #getBuiltinFolderOrFromRepository(
		uuid: string,
	): Promise<Either<NodeNotFoundError, FolderNode>> {
		// Check if it's the root folder
		if (uuid === Nodes.ROOT_FOLDER_UUID || uuid === Nodes.uuidToFid(Nodes.ROOT_FOLDER_UUID)) {
			const rootFolder = FolderNode.create({
				uuid: Nodes.ROOT_FOLDER_UUID,
				fid: Nodes.ROOT_FOLDER_UUID,
				title: "Root",
				parent: Nodes.ROOT_FOLDER_UUID,
				owner: Users.ROOT_USER_EMAIL,
				group: Groups.ADMINS_GROUP_UUID,
				filters: [["mimetype", "in", [
					Nodes.FOLDER_MIMETYPE,
					Nodes.SMART_FOLDER_MIMETYPE,
				]]],
				permissions: {
					group: ["Read", "Write", "Export"],
					authenticated: ["Read"],
					anonymous: [],
					advanced: {},
				},
			}).right;
			return right(rootFolder);
		}

		const nodeOrErr = await this.#getFromRepository(uuid);
		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}

		if (!Nodes.isFolder(nodeOrErr.value)) {
			return left(new FolderNotFoundError(uuid));
		}

		return right(nodeOrErr.value);
	}

	async #getBuiltinNodeOrFromRepository(
		uuid: string,
	): Promise<Either<NodeNotFoundError, NodeLike>> {
		// Check if it's the root folder
		const key = Nodes.isFid(uuid) ? Nodes.uuidToFid(uuid) : uuid;
		if (key === Nodes.ROOT_FOLDER_UUID) {
			const rootFolder = FolderNode.create({
				uuid: Nodes.ROOT_FOLDER_UUID,
				fid: Nodes.ROOT_FOLDER_UUID,
				title: "Root",
				parent: Nodes.ROOT_FOLDER_UUID,
				owner: Users.ROOT_USER_EMAIL,
				group: Groups.ADMINS_GROUP_UUID,
				filters: [["mimetype", "in", [
					Nodes.FOLDER_MIMETYPE,
					Nodes.SMART_FOLDER_MIMETYPE,
				]]],
				permissions: {
					group: ["Read", "Write", "Export"],
					authenticated: ["Read"],
					anonymous: [],
					advanced: {},
				},
			}).right;
			return right(rootFolder);
		}

		return this.#getFromRepository(uuid);
	}

	async #getFromRepository(
		uuid: string,
	): Promise<Either<NodeNotFoundError, NodeLike>> {
		if (Nodes.isFid(uuid)) {
			return await this.context.repository.getByFid(Nodes.uuidToFid(uuid));
		}

		return this.context.repository.getById(uuid);
	}

	async #getNodeAspects(
		ctx: AuthenticationContext,
		node: FileNode | FolderNode | MetaNode,
	): Promise<Either<ValidationError, AspectData[]>> {
		if (!node.aspects || node.aspects.length === 0) {
			return right([]);
		}

		const aspectsOrErrs = await Promise.all(
			node.aspects.map((uuid) => this.context.configRepo.get("aspects", uuid)),
		);

		// Check if any aspects were not found
		const missingAspects: string[] = [];
		const foundAspects: AspectData[] = [];

		for (let i = 0; i < aspectsOrErrs.length; i++) {
			const aspectOrErr = aspectsOrErrs[i];
			if (aspectOrErr.isLeft()) {
				missingAspects.push(node.aspects![i]);
			} else {
				foundAspects.push(aspectOrErr.value);
			}
		}

		if (missingAspects.length > 0) {
			return left(
				new ValidationError(
					`Aspect(s) not found: ${missingAspects.join(", ")}`,
					[],
				),
			);
		}

		return right(foundAspects);
	}

	async #validateNodeAspectsThenUpdate(
		ctx: AuthenticationContext,
		node: FileNode | FolderNode | MetaNode,
		aspects: AspectData[],
	): Promise<Either<ValidationError, void>> {
		if (!aspects.length) {
			node.update({ aspects: [], properties: {} });
			return Promise.resolve(right(undefined));
		}

		const curProps = node.metadata.properties as NodeProperties;
		const accProps = {} as NodeProperties;
		const validators = aspects.map(Aspects.specificationFrom);

		for (const a of aspects) {
			a.properties.forEach((p) =>
				this.#addAspectPropertyToNode(
					accProps,
					curProps,
					p,
					`${a.uuid}:${p.name}`,
				)
			);

			const uuidProperties = a.properties.filter((f) =>
				f.type === "uuid" || f.arrayType === "uuid"
			);

			if (!uuidProperties.length) continue;

			const v = uuidProperties.map((p) => {
				const value = (accProps[`${a.uuid}:${p.name}`] ?? p.defaultValue) as
					| string
					| string[]
					| undefined;
				return this.#validateUUIDProperty(ctx, p, value);
			});

			validators.push(...(await Promise.all(v)));
		}

		node.update({ properties: accProps });

		const errors = validators
			.map((v) => v.isSatisfiedBy(node))
			.filter((v) => v.isLeft())
			.map((v) => v.value.errors)
			.flat();

		if (errors.length) {
			return Promise.resolve(left(ValidationError.from(...errors)));
		}

		return Promise.resolve(right(undefined));
	}

	async #validateUUIDProperty(
		_auth: AuthenticationContext,
		property: AspectProperty,
		values: string | string[] | undefined,
	): Promise<Specification<NodeLike>> {
		if (property.type !== "uuid" && property.arrayType !== "uuid") {
			Logger.warn(
				`Property ${property.name} is not of type 'uuid' or 'array of uuid'. Skipping UUID validation.`,
			);
			return specificationFn(() => right(true));
		}

		if (!values || !values.length) {
			return specificationFn(() => right(true));
		}

		if (!Array.isArray(values)) {
			values = [values];
		}

		// First, always validate that all referenced nodes exist
		const nodesOrErrs = await Promise.all(
			values.map((uuid) => this.#getBuiltinNodeOrFromRepository(uuid)),
		);

		const notFound = nodesOrErrs.filter((n) => n.isLeft());
		if (notFound.length) {
			const errs = notFound.map((n) => n.value as AntboxError);
			return specificationFn(() => left(ValidationError.from(...errs)));
		}

		// If validationFilters are defined, also check filter compliance
		if (property.validationFilters && property.validationFilters.length > 0) {
			// TODO This code calls spec directly so it can verify @filters, will remove them for now
			let filters: NodeFilters2D = isNodeFilters2D(property.validationFilters)
				? property.validationFilters
				: [property.validationFilters];

			filters = filters.map((f) => {
				return f.filter((f1: NodeFilter) => !f1[0].startsWith("@"));
			}) as NodeFilters2D;

			const spec = NodesFilters.nodeSpecificationFrom(filters);

			const results = nodesOrErrs.map((n) => spec.isSatisfiedBy(n.right));
			const notComply = results.filter((r) => r.isLeft());

			if (notComply.length) {
				const errs = notComply
					.map((r) => r.value as ValidationError)
					.map((e) => e.errors)
					.flat();
				return specificationFn(() => left(ValidationError.from(...errs)));
			}
		}

		return specificationFn(() => right(true));
	}

	#addAspectPropertyToNode(
		accProperties: NodeProperties,
		curProperties: NodeProperties,
		property: AspectProperty,
		key: string,
	) {
		const value = curProperties[key] ?? property.defaultValue ?? undefined;

		if (value !== undefined) {
			accProperties[key] = value;
		}
	}

	#aspectToProperties(aspect: AspectData): AspectProperty[] {
		return aspect.properties.map((p) => {
			return { ...p, name: `${aspect.uuid}:${p.name}` };
		});
	}

	async #filterReadonlyProperties(
		ctx: AuthenticationContext,
		node: NodeLike,
		metadata: Partial<NodeMetadata>,
	): Promise<Partial<NodeMetadata>> {
		// If no properties are being updated, return metadata as-is
		if (!metadata.properties) {
			return metadata;
		}

		// If node doesn't have aspects, return metadata as-is
		if (!Nodes.hasAspects(node)) {
			return metadata;
		}

		// Get node aspects to check for readonly properties
		const aspectsOrErr = await this.#getNodeAspects(ctx, node);
		if (aspectsOrErr.isLeft()) {
			return metadata;
		}

		const aspects = aspectsOrErr.value;

		// Create a map of property names to their readonly status
		const readonlyMap = new Map<string, boolean>();
		for (const aspect of aspects) {
			const aspectProperties = this.#aspectToProperties(aspect);
			for (const prop of aspectProperties) {
				// prop.name already includes the aspect prefix from #aspectToProperties
				readonlyMap.set(prop.name, prop.readonly === true);
			}
		}

		// Replace readonly property values with existing node values
		const safeProperties: Record<string, unknown> = {};
		const currentProperties = (node as AspectableNode).properties || {};

		for (const [key, value] of Object.entries(metadata.properties)) {
			const isReadonly = readonlyMap.get(key);
			if (isReadonly) {
				// For readonly properties, use the existing value from the node
				safeProperties[key] = currentProperties[key];
			} else {
				// For editable properties, use the new value
				safeProperties[key] = value;
			}
		}

		return {
			...metadata,
			properties: safeProperties,
		};
	}

	#mapAntboxMimetypes(mimetype: string): string {
		const mimetypeMap: Record<string, string> = {
			[Nodes.SMART_FOLDER_MIMETYPE]: "application/json",
		};

		return mimetypeMap[mimetype] ?? mimetype;
	}

	#canUnlockNode(ctx: AuthenticationContext, node: NodeLike): boolean {
		// User who locked the node can unlock it
		if (node.lockedBy === ctx.principal.email) {
			return true;
		}

		// Check if user belongs to any of the authorized groups
		const userGroups = ctx.principal.groups;
		const authorizedGroups = node.unlockAuthorizedGroups || [];

		return authorizedGroups.some((group: string) => userGroups.includes(group));
	}

	#checkNodeLock(ctx: AuthenticationContext, node: NodeLike): Either<BadRequestError, void> {
		// If node is not locked, allow operation
		if (!node.locked) {
			return right(undefined);
		}

		// Check if user can unlock (same logic as unlock authorization)
		if (this.#canUnlockNode(ctx, node)) {
			return right(undefined);
		}

		return left(
			new BadRequestError(
				`Node is locked by ${node.lockedBy}. You are not authorized to modify it.`,
			),
		);
	}
}
