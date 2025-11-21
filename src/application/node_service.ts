import { AspectNode, type AspectProperty } from "domain/aspects/aspect_node.ts";
import { Aspects } from "domain/aspects/aspects.ts";
import { NodeFactory } from "domain/node_factory.ts";
import type { AspectableNode, FileLikeNode, NodeLike } from "domain/node_like.ts";
import { FileNode } from "domain/nodes/file_node.ts";
import { FolderNode } from "domain/nodes/folder_node.ts";
import { FolderNotFoundError } from "domain/nodes/folder_not_found_error.ts";
import { Folders } from "domain/nodes/folders.ts";
import { MetaNode } from "domain/nodes/meta_node.ts";
import { Node, type Permission } from "domain/nodes/node.ts";
import { NodeCreatedEvent } from "domain/nodes/node_created_event.ts";
import { NodeDeletedEvent } from "domain/nodes/node_deleted_event.ts";
import { NodeUpdateChanges, NodeUpdatedEvent } from "domain/nodes/node_updated_event.ts";
import {
	isNodeFilters2D,
	type NodeFilter,
	type NodeFilters,
	type NodeFilters1D,
	type NodeFilters2D,
} from "domain/nodes/node_filter.ts";

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
import { UuidGenerator } from "shared/uuid_generator.ts";
import { ValidationError } from "shared/validation_error.ts";
import type { AuthenticationContext } from "application/authentication_context.ts";
import {
	builtinFolders,
	SYSTEM_FOLDER,
	SYSTEM_FOLDERS,
} from "application/builtin_folders/index.ts";
import { isPrincipalAllowedTo } from "application/is_principal_allowed_to.ts";
import type { NodeServiceContext } from "application/node_service_context.ts";
import { Specification, specificationFn } from "shared/specification.ts";
import { builtinAspects } from "./builtin_aspects/index.ts";
import { builtinGroups } from "./builtin_groups/index.ts";
import { builtinUsers } from "./builtin_users/index.ts";
import { builtinAgents } from "./builtin_agents/index.ts";
import { FeatureNode, FeatureParameter } from "domain/features/feature_node.ts";
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

	constructor(private readonly context: NodeServiceContext) {
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
		const nodeOrErr = await this.get(ctx, uuid);
		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}

		if (Nodes.isFolder(nodeOrErr.value)) {
			return left(new BadRequestError("Cannot copy folder"));
		}

		const metadata = {
			...nodeOrErr.value.metadata,
			uuid: UuidGenerator.generate(),
			title: `${nodeOrErr.value.title} 2`,
			parent,
		};

		delete metadata.fid;

		if (!Nodes.isFileLike(nodeOrErr.value)) {
			return this.create(ctx, metadata);
		}

		const fileOrErr = await this.context.storage.read(uuid);
		if (fileOrErr.isLeft()) {
			return left(fileOrErr.value);
		}

		return this.createFile(ctx, fileOrErr.value, metadata);
	}

	async create(
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

		const allowedOrErr = isPrincipalAllowedTo(ctx, parentOrErr.value, "Write");
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
		).isRight();
		if (!filtersSatisfied) {
			return left(new BadRequestError("Node does not satisfy parent filters"));
		}

		const featureOrErr = this.#validateFeature(nodeOrErr.value);
		if (featureOrErr.isLeft()) {
			return left(featureOrErr.value);
		}

		nodeOrErr.value.update({
			fulltext: await this.#calculateFulltext(ctx, nodeOrErr.value),
		});

		const voidOrErr = await this.context.repository.add(nodeOrErr.value);
		if (voidOrErr.isLeft()) {
			return left(voidOrErr.value);
		}

		// Publish NodeCreatedEvent
		const evt = new NodeCreatedEvent(ctx.principal.email, ctx.tenant, nodeOrErr.value);
		this.context.bus.publish(evt);

		return right(nodeOrErr.value);
	}

	async createFile(
		ctx: AuthenticationContext,
		file: File,
		metadata: Partial<NodeMetadata>,
	): Promise<Either<AntboxError, FileLikeNode>> {
		const useFileType = file.type &&
			(!metadata.mimetype || metadata.mimetype !== Nodes.FEATURE_MIMETYPE);

		const nodeOrErr = await this.create(ctx, {
			...metadata,
			title: metadata.title ?? file.name,
			fid: metadata.fid ?? FidGenerator.generate(metadata.title ?? file.name),
			mimetype: useFileType ? file.type : metadata.mimetype,
			size: file.size,
		});

		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}

		const node = nodeOrErr.value as FileLikeNode;

		let voidOrErr = await this.context.storage.write(node.uuid, file, {
			title: node.title,
			parent: node.parent,
			mimetype: node.mimetype,
		});
		if (voidOrErr.isLeft()) {
			return left(voidOrErr.value);
		}

		voidOrErr = await this.context.repository.add(node);
		if (voidOrErr.isLeft()) {
			return left(voidOrErr.value);
		}

		// Publish NodeCreatedEvent
		const evt = new NodeCreatedEvent(ctx.principal.email, ctx.tenant, node);
		this.context.bus.publish(evt);

		return right(node);
	}

	async delete(
		ctx: AuthenticationContext,
		uuid: string,
	): Promise<Either<NodeNotFoundError, void>> {
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

		const allowedOrErr = isPrincipalAllowedTo(ctx, parentOrErr.value, "Write");
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
				const evt = new NodeDeletedEvent(ctx.principal.email, ctx.tenant, nodeOrErr.value);
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
			const evt = new NodeDeletedEvent(ctx.principal.email, ctx.tenant, nodeOrErr.value);
			this.context.bus.publish(evt);
		}

		return v;
	}

	async duplicate(
		ctx: AuthenticationContext,
		uuid: string,
	): Promise<Either<NodeNotFoundError, Node>> {
		const nodeOrErr = await this.get(ctx, uuid);

		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}

		if (Nodes.isFolder(nodeOrErr.value)) {
			return left(new BadRequestError("Cannot duplicate folder"));
		}

		const metadata = {
			...nodeOrErr.value.metadata,
			uuid: UuidGenerator.generate(),
			title: `${nodeOrErr.value.title} 2`,
		};

		delete metadata.fid;

		if (!Nodes.isFileLike(nodeOrErr.value)) {
			return this.create(ctx, metadata);
		}

		const fileOrErr = await this.context.storage.read(uuid);
		if (fileOrErr.isLeft()) {
			return left(fileOrErr.value);
		}

		return this.createFile(ctx, fileOrErr.value, metadata);
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

		const allowedOrErr = isPrincipalAllowedTo(ctx, parentOrErr.value, "Export");
		if (allowedOrErr.isLeft()) {
			return left(allowedOrErr.value);
		}

		const fileOrErr = await this.context.storage.read(uuid);
		if (fileOrErr.isLeft()) {
			return left(fileOrErr.value);
		}

		const type = this.#mapAntboxMimetypes(nodeOrErr.value.mimetype);
		if (Nodes.isAction(nodeOrErr.value)) {
			return right(
				new File([fileOrErr.value], nodeOrErr.value.title.concat(".js"), {
					type,
				}),
			);
		}

		return right(
			new File([fileOrErr.value], nodeOrErr.value.title, { type }),
		);
	}

	async evaluate(
		ctx: AuthenticationContext,
		uuid: string,
	): Promise<Either<SmartFolderNodeNotFoundError, NodeLike[]>> {
		const nodeOrErr = await this.get(ctx, uuid);
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

		return right(evaluationOrErr.value.nodes);
	}

	async find(
		ctx: AuthenticationContext,
		filters: NodeFilters | string,
		pageSize = 20,
		pageToken = 1,
	): Promise<Either<AntboxError, NodeFilterResult>> {
		if (typeof filters === "string") {
			const filtersOrErr = NodesFilters.parse(filters);

			if (filtersOrErr.isRight()) return this.find(ctx, filtersOrErr.value, pageSize, pageToken);
			console.debug("defaulting to content search");
			return this.find(ctx, [[":content", "~=", filters]], pageSize, pageToken);
		}

		filters = isNodeFilters2D(filters) ? filters : [filters];

		// Check for semantic search operator (~= on :content field)
		const semanticSearchResult = await this.#extractAndPerformSemanticSearch(filters, ctx.tenant);

		if (semanticSearchResult) {
			// Remove semantic search filter and add UUID filter from results
			filters = this.#addUuidFilterToFilters(
				this.#removeSemanticSearchFilter(filters),
				semanticSearchResult.uuids,
			);
		}

		const stage1 = filters.reduce(
			this.#toFiltersWithPermissionsResolved(ctx, "Read"),
			[],
		);

		const batch = stage1.map((f) => this.#toFiltersWithAtResolved(f));
		const stage2 = await Promise.allSettled(batch);
		const stage3 = stage2.filter((r) => r.status === "fulfilled").map((r) => r.value);
		const processedFilters = stage3.filter((f) => f.length);

		const r = await this.context.repository.filter(
			processedFilters,
			pageSize,
			pageToken,
		);

		// Add scores if semantic search was performed
		if (semanticSearchResult) {
			r.scores = semanticSearchResult.scores;
		}

		return right(r);
	}

	async get(
		ctx: AuthenticationContext,
		uuid: string,
	): Promise<Either<NodeNotFoundError, NodeLike>> {
		const nodeOrErr = await this.#getBuiltinNodeOrFromRepository(uuid);
		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}

		if (Nodes.isFolder(nodeOrErr.value)) {
			const allowedOrErr = isPrincipalAllowedTo(ctx, nodeOrErr.value, "Read");
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

		const allowedOrErr = isPrincipalAllowedTo(ctx, parentOrErr.value, "Read");
		if (allowedOrErr.isLeft()) {
			return left(allowedOrErr.value);
		}

		return right(nodeOrErr.value);
	}

	async list(
		ctx: AuthenticationContext,
		parent = Folders.ROOT_FOLDER_UUID,
	): Promise<Either<FolderNotFoundError | ForbiddenError, NodeLike[]>> {
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

		const allowedOrErr = isPrincipalAllowedTo(ctx, parentOrErr.value, "Read");
		if (allowedOrErr.isLeft()) {
			return left(allowedOrErr.value);
		}

		if (Folders.isSystemRootFolder(parentOrErr.value)) {
			return right(this.#listSystemRootFolder());
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

		if (parent === Folders.ROOT_FOLDER_UUID) {
			nodes.push(SYSTEM_FOLDER);
		}

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

		return right(nodes);
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
		while (currentUuid && currentUuid !== Folders.ROOT_FOLDER_UUID) {
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
		if (breadcrumbs.length === 0 || breadcrumbs[0].uuid !== Folders.ROOT_FOLDER_UUID) {
			breadcrumbs.unshift({
				uuid: Folders.ROOT_FOLDER_UUID,
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
		let nodeOrErr = await this.get(ctx, uuid);
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

		const allowedOrErr = isPrincipalAllowedTo(
			ctx,
			currentParentOrErr.value,
			"Write",
		);
		if (allowedOrErr.isLeft()) {
			return left(allowedOrErr.value);
		}

		if (Nodes.isApikey(nodeOrErr.value)) {
			return left(new BadRequestError("Cannot update apikey"));
		}

		if (Nodes.isFileLike(nodeOrErr.value)) {
			nodeOrErr = NodeFactory.from({
				...nodeOrErr.value.metadata,
				size: metadata.size,
			});
			if (nodeOrErr.isLeft()) {
				return left(nodeOrErr.value);
			}
		}

		// Filter out readonly properties from metadata before updating
		const filteredMetadata = await this.#filterReadonlyProperties(
			ctx,
			nodeOrErr.value,
			metadata,
		);

		const voidOrErr = nodeOrErr.value.update(filteredMetadata);
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

		const featureOrErr = this.#validateFeature(nodeOrErr.value);
		if (featureOrErr.isLeft()) {
			return left(featureOrErr.value);
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
				newValues: metadata,
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
		const nodeOrErr = await this.get(ctx, uuid);
		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}

		if (!Nodes.isFileLike(nodeOrErr.value)) {
			return left(new NodeNotFoundError(uuid));
		}

		if (this.#mapAntboxMimetypes(nodeOrErr.value.mimetype) !== file.type) {
			return left(new BadRequestError("Mimetype mismatch"));
		}

		await this.context.storage.write(uuid, file, {
			title: nodeOrErr.value.title,
			parent: nodeOrErr.value.parent,
			mimetype: nodeOrErr.value.mimetype,
		});

		return this.update(ctx, uuid, { size: file.size });
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
		const filters: NodeFilters1D = [];
		if (Nodes.isFid(uuid)) {
			filters.push(["fid", "==", Nodes.uuidToFid(uuid)]);
		} else {
			filters.push(["uuid", "==", uuid]);
		}

		const builtinFolder = builtinFolders.find((n) =>
			NodesFilters.satisfiedBy(filters, n).isRight()
		);
		if (builtinFolder) {
			return right(builtinFolder);
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

	#getBuiltinNodeOrFromRepository(
		uuid: string,
	): Promise<Either<NodeNotFoundError, NodeLike>> {
		const key = Nodes.isFid(uuid) ? Nodes.uuidToFid(uuid) : uuid;
		const predicate = Nodes.isFid(uuid)
			? (f: NodeLike) => f.fid === key
			: (f: NodeLike) => f.uuid === key;

		const builtinNodes: NodeLike[] = [
			...builtinFolders,
			...builtinAspects,
			...builtinGroups,
			...builtinUsers,
			...builtinAgents,
			//...builtinFeatures,
		];
		const builtinNode = builtinNodes.find(predicate);

		if (builtinNode) {
			return Promise.resolve(right(builtinNode));
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
	): Promise<Either<ValidationError, AspectNode[]>> {
		if (!node.aspects || node.aspects.length === 0) {
			return right([]);
		}

		const nodesOrErrs = await Promise.all(
			node.aspects.map((a) => this.get(ctx, a)),
		);

		// Check if any aspects were not found
		const missingAspects: string[] = [];
		const foundAspects: AspectNode[] = [];

		for (let i = 0; i < nodesOrErrs.length; i++) {
			const nodeOrErr = nodesOrErrs[i];
			if (nodeOrErr.isLeft()) {
				missingAspects.push(node.aspects![i]);
			} else {
				foundAspects.push(nodeOrErr.value as AspectNode);
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

	async #toFiltersWithAtResolved(f: NodeFilters1D): Promise<NodeFilters1D> {
		if (!f.some((f) => f[0].startsWith("@"))) {
			return f;
		}

		const [at, filters] = f.reduce(
			(acc, cur) => {
				if (cur[0].startsWith("@")) {
					acc[0].push([cur[0].substring(1), cur[1], cur[2]]);
					return acc;
				}

				acc[1].push(cur);
				return acc;
			},
			[[], []] as [NodeFilters1D, NodeFilters1D],
		);

		at.push(["mimetype", "==", Nodes.FOLDER_MIMETYPE]);

		const parentFilter = filters.find((f) => f[0] === "parent");
		if (parentFilter) {
			at.push(["uuid", parentFilter[1], parentFilter[2]]);
		}

		// Since system folders are not stored in the repository, we need to handle them separately
		const spec = NodesFilters.nodeSpecificationFrom(at);
		const sysFolders = builtinFolders.filter((f) => spec.isSatisfiedBy(f).isRight());

		const result = await this.context.repository.filter(
			at,
			Number.MAX_SAFE_INTEGER,
			1,
		);
		const parentList = [
			...result.nodes.map((n) => n.uuid),
			...sysFolders.map((n) => n.uuid),
		];

		if (parentList.length === 0) {
			return [];
		}

		const cleanFilters = filters.filter((f) => f[0] !== "parent");
		return [...cleanFilters, ["parent", "in", parentList]];
	}

	async #validateNodeAspectsThenUpdate(
		ctx: AuthenticationContext,
		node: FileNode | FolderNode | MetaNode,
		aspects: AspectNode[],
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
				const value = (accProps[`${a.uuid}:${p.name}`] ?? p.default) as
					| string
					| string[];
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
		auth: AuthenticationContext,
		property: AspectProperty,
		values: string | string[],
	): Promise<Specification<NodeLike>> {
		if (property.type !== "uuid" && property.arrayType !== "uuid") {
			console.warn(
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
			values.map((uuid) => this.get(auth, uuid)),
		);

		const notFound = nodesOrErrs.filter((n) => n.isLeft());
		if (notFound.length) {
			const errs = notFound.map((n) => n.value as AntboxError);
			return specificationFn(() => left(ValidationError.from(...errs)));
		}

		// If validationFilters are defined, also check filter compliance
		if (property.validationFilters && property.validationFilters.length > 0) {
			const spec = NodesFilters.nodeSpecificationFrom(
				property.validationFilters,
			);

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
		const value = curProperties[key] ?? property.default ?? undefined;

		if (value || value === false) {
			accProperties[key] = value;
		}
	}

	#addAnonymousPermissionFilters(f: NodeFilters2D, p: Permission) {
		this.#addPermissionFilters(f, [["permissions.anonymous", "contains", p]]);
	}

	#addAuthenticatedPermissionFilters(
		ctx: AuthenticationContext,
		f: NodeFilters2D,
		p: Permission,
	) {
		this.#addPermissionFilters(f, [[
			"permissions.authenticated",
			"contains",
			p,
		]]);
		this.#addPermissionFilters(f, [["owner", "==", ctx.principal.email]]);
		this.#addPermissionFilters(f, [
			["group", "==", ctx.principal.groups[0]],
			["permissions.group", "contains", p],
		]);

		ctx.principal.groups.forEach((g) => {
			this.#addPermissionFilters(f, [[
				`permissions.advanced.${g}`,
				"contains",
				p,
			]]);
		});
	}

	#addPermissionFilters(f: NodeFilters2D, filters: NodeFilter[]) {
		f.push([...filters, ["mimetype", "==", Nodes.FOLDER_MIMETYPE]]);

		f.push([
			...filters.map((
				[field, operator, value],
			): NodeFilter => [`@${field}`, operator, value]),
			["mimetype", "!=", Nodes.FOLDER_MIMETYPE],
		]);
	}

	#aspectToProperties(aspect: AspectNode): AspectProperty[] {
		return aspect.properties.map((p) => {
			return { ...p, name: `${aspect.uuid}:${p.name}` };
		});
	}

	#listSystemRootFolder(): FolderNode[] {
		return SYSTEM_FOLDERS;
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
		const mimetypeMap = {
			[Nodes.FEATURE_MIMETYPE]: "application/javascript",
			[Nodes.SMART_FOLDER_MIMETYPE]: "application/json",
		};

		return mimetypeMap[mimetype] ?? mimetype;
	}

	#toFiltersWithPermissionsResolved(
		ctx: AuthenticationContext,
		permission: Permission,
	): (acc: NodeFilters2D, cur: NodeFilters1D) => NodeFilters2D {
		if (ctx.principal.groups.includes(Groups.ADMINS_GROUP_UUID)) {
			return (acc: NodeFilters2D, cur: NodeFilters1D) => {
				acc.push(cur);
				return acc;
			};
		}

		const permissionFilters: NodeFilters2D = [];
		this.#addAnonymousPermissionFilters(permissionFilters, permission);

		if (ctx.principal.email !== Users.ANONYMOUS_USER_EMAIL) {
			this.#addAuthenticatedPermissionFilters(
				ctx,
				permissionFilters,
				permission,
			);
		}

		return (acc: NodeFilters2D, cur: NodeFilters1D) => {
			for (const j of permissionFilters) {
				acc.push([...cur, ...j]);
			}

			return acc;
		};
	}

	#validateFeature(node: NodeLike): Either<AntboxError, void> {
		if (!Nodes.isFeature(node)) {
			return right(undefined);
		}

		const feature = node as FeatureNode; // Cast to access feature properties
		const exposureCount = [
			feature.exposeAction,
			feature.exposeExtension,
			feature.exposeAITool,
		].filter(Boolean).length;

		// Feature must expose at least one subtype
		if (exposureCount === 0) {
			return left(
				new BadRequestError(
					"Feature must expose at least one subtype (exposeAction, exposeExtension, or exposeAITool must be true)",
				),
			);
		}

		// Validate parameters structure if present
		if (feature.parameters && Array.isArray(feature.parameters)) {
			for (const param of feature.parameters) {
				if (!param.name || typeof param.name !== "string") {
					return left(
						new BadRequestError(
							"Feature parameter must have a valid 'name' field",
						),
					);
				}
				if (!param.type || typeof param.type !== "string") {
					return left(
						new BadRequestError(
							`Feature parameter '${param.name}' must have a valid 'type' field`,
						),
					);
				}
			}
		}

		// Action-specific validation
		if (feature.exposeAction) {
			const validationErr = this.#validateActionFeature(feature);
			if (validationErr) return left(validationErr);
		}

		// Extension-specific validation
		if (feature.exposeExtension) {
			const validationErr = this.#validateExtensionFeature(feature);
			if (validationErr) return left(validationErr);
		}

		// AI Tool-specific validation
		if (feature.exposeAITool) {
			const validationErr = this.#validateAIToolFeature(feature);
			if (validationErr) return left(validationErr);
		}

		return right(undefined);
	}

	#validateActionFeature(feature: FeatureNode): BadRequestError | null {
		// Actions must have parameters
		if (!feature.parameters || !Array.isArray(feature.parameters)) {
			return new BadRequestError(
				"Feature with exposeAction=true must have parameters array",
			);
		}

		// Actions must have uuids parameter
		const uuidsParam = feature.parameters.find((p: FeatureParameter) => p.name === "uuids");
		if (!uuidsParam) {
			return new BadRequestError(
				"Feature with exposeAction=true must have a uuids parameter",
			);
		}

		// uuids parameter must be array of strings
		if (uuidsParam.type !== "array") {
			return new BadRequestError(
				"Action uuids parameter must be of type 'array'",
			);
		}

		if (uuidsParam.arrayType !== "string") {
			return new BadRequestError(
				"Action uuids parameter must be array of strings (arrayType: 'string')",
			);
		}

		// Actions cannot have file parameters
		const hasFileParam = feature.parameters.some((p: FeatureParameter) => p.type === "file");
		if (hasFileParam) {
			return new BadRequestError(
				"Actions cannot have file parameters",
			);
		}

		return null;
	}

	#validateExtensionFeature(feature: FeatureNode): BadRequestError | null {
		// Extensions cannot have uuids parameter unless they're also Actions
		if (feature.parameters && Array.isArray(feature.parameters)) {
			const hasUuidsParam = feature.parameters.some((p: FeatureParameter) => p.name === "uuids");
			if (hasUuidsParam && !feature.exposeAction) {
				return new BadRequestError(
					"Extensions cannot have uuids parameter (Action-specific)",
				);
			}
		}

		// Extensions can have file parameters (this is allowed)
		// Extensions have different run signature: (request) => Response
		// This validation would need runtime checking, but we document the expectation

		return null;
	}

	#validateAIToolFeature(feature: FeatureNode): BadRequestError | null {
		// AI Tools cannot have uuids parameter unless they're also Actions
		if (feature.parameters && Array.isArray(feature.parameters)) {
			const hasUuidsParam = feature.parameters.some((p: FeatureParameter) => p.name === "uuids");
			if (hasUuidsParam && !feature.exposeAction) {
				return new BadRequestError(
					"AI Tools cannot have uuids parameter (Action-specific)",
				);
			}

			// AI Tools cannot have file parameters
			const hasFileParam = feature.parameters.some((p: FeatureParameter) => p.type === "file");
			if (hasFileParam) {
				return new BadRequestError(
					"AI Tools cannot have file parameters",
				);
			}
		}

		// AI Tools have different run signature: (context, params) => any
		// This validation would need runtime checking, but we document the expectation

		return null;
	}

	async #extractAndPerformSemanticSearch(
		filters: NodeFilters2D,
		_tenant: string,
	): Promise<{ uuids: string[]; scores: Record<string, number>; query: string } | null> {
		// Check if AI features are available
		if (!this.context.vectorDatabase || !this.context.embeddingModel) {
			return null;
		}

		// Look for semantic search filter: [":content", "~=", "query text"]
		let semanticQuery: string | null = null;

		for (const filterGroup of filters) {
			for (const filter of filterGroup) {
				if (filter[0] === ":content" && filter[1] === "~=") {
					semanticQuery = String(filter[2]);
					break;
				}
			}
			if (semanticQuery) break;
		}

		if (!semanticQuery) {
			return null;
		}

		try {
			// Generate embedding for query using embedding model
			const embeddingsOrErr = await this.context.embeddingModel.embed([semanticQuery]);
			if (embeddingsOrErr.isLeft()) {
				console.error("Failed to generate embedding for query:", embeddingsOrErr.value);
				return null;
			}

			const queryEmbedding = embeddingsOrErr.value[0];

			// Search vector database
			const searchOrErr = await this.context.vectorDatabase.search(
				queryEmbedding,
				100, // topK - return top 100 results
			);

			if (searchOrErr.isLeft()) {
				console.error("Vector database search failed:", searchOrErr.value);
				return null;
			}

			const results = searchOrErr.value;
			const uuids = results.map((r) => r.nodeUuid);
			const scores: Record<string, number> = {};
			for (const result of results) {
				scores[result.nodeUuid] = result.score;
			}

			return { uuids, scores, query: semanticQuery };
		} catch (error) {
			console.error("Semantic search failed:", error);
			return null;
		}
	}

	#removeSemanticSearchFilter(filters: NodeFilters2D): NodeFilters2D {
		return filters.map((filterGroup) =>
			filterGroup.filter((filter) => !(filter[0] === ":content" && filter[1] === "~="))
		).filter((filterGroup) => filterGroup.length > 0);
	}

	#addUuidFilterToFilters(filters: NodeFilters2D, uuids: string[]): NodeFilters2D {
		if (uuids.length === 0) {
			// No results from semantic search, return filter that matches nothing
			return [[["uuid", "==", "@@semantic-search-no-results@@"]]];
		}

		if (filters.length === 0) {
			return [[["uuid", "in", uuids] as NodeFilter]];
		}

		// Add UUID filter to each filter group (AND condition)
		return filters.map((filterGroup) => [
			...filterGroup,
			["uuid", "in", uuids] as NodeFilter,
		]);
	}
}
