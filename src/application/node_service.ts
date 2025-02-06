import { AspectProperty } from "../domain/aspects/aspect.ts";
import { AspectNode } from "../domain/aspects/aspect_node.ts";
import { AggregationFormulaError } from "../domain/nodes/aggregation_formula_error.ts";
import { FileNode } from "../domain/nodes/file_node.ts";
import { FolderNode } from "../domain/nodes/folder_node.ts";
import { FolderNotFoundError } from "../domain/nodes/folder_not_found_error.ts";
import { Folders } from "../domain/nodes/folders.ts";
import { MetaNode } from "../domain/nodes/meta_node.ts";
import { Node } from "../domain/nodes/node.ts";
import { NodeFactory } from "../domain/nodes/node_factory.ts";
import { NodeFilter } from "../domain/nodes/node_filter.ts";
import { NodeLike } from "../domain/nodes/node_like.ts";
import { NodeMetadata } from "../domain/nodes/node_metadata.ts";
import { NodeNotFoundError } from "../domain/nodes/node_not_found_error.ts";
import { NodeFilterResult } from "../domain/nodes/node_repository.ts";
import { Nodes } from "../domain/nodes/nodes.ts";
import {
	AggregationResult,
	Reducers,
	SmartFolderNodeEvaluation,
} from "../domain/nodes/smart_folder_evaluation.ts";
import { Aggregation, SmartFolderNode } from "../domain/nodes/smart_folder_node.ts";
import { SmartFolderNodeNotFoundError } from "../domain/nodes/smart_folder_node_not_found_error.ts";
import { AntboxError, BadRequestError, ForbiddenError } from "../shared/antbox_error.ts";
import { Either, left, right } from "../shared/either.ts";
import { isPrincipalAllowedTo } from "./is_principal_allowed_to.ts";
import { AuthenticationContext } from "./authentication_context.ts";
import { NodeDeleter } from "./node_deleter.ts";
import { NodeServiceContext } from "./node_service_context.ts";

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
	constructor(private readonly context: NodeServiceContext) {}

	async createFile(
		file: File,
		metadata: Partial<NodeMetadata>,
	): Promise<Either<AntboxError, Node>> {
		metadata.title = metadata.title ?? file.name;

		const validOrErr = await this.#verifyParent(metadata);
		if (validOrErr.isLeft()) {
			return left(validOrErr.value);
		}

		const uuid = metadata.uuid ?? this.context.uuidGenerator.generate();
		const fid = metadata.fid ??
			this.context.fidGenerator.generate(metadata.title ?? uuid);

		const nodeOrErr = NodeFactory.from({
			...metadata,
			uuid,
			fid,
			mimetype: metadata.mimetype ?? file.type,
			size: file.size,
		});

		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}

		const node = nodeOrErr.value;
		node.fulltext = await this.#calculateFulltext(node);

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

		return right(node);
	}

	async #verifyParent(
		metadata: Partial<NodeMetadata>,
	): Promise<Either<AntboxError, true>> {
		if (!metadata.parent) {
			return left(new BadRequestError("parent is required"));
		}

		if (Folders.isSystemFolder(metadata.parent)) {
			return right(true);
		}

		const parentUuid = metadata.parent ?? Folders.ROOT_FOLDER_UUID;
		const parentOrErr = await this.get(parentUuid);
		if (parentOrErr.isLeft()) {
			return left(new FolderNotFoundError(parentUuid));
		}

		return right(true);
	}

	async create(
		metadata: Partial<NodeMetadata>,
	): Promise<Either<AntboxError, NodeLike>> {
		const validOrErr = await this.#verifyParent(metadata);
		if (validOrErr.isLeft()) {
			return left(validOrErr.value);
		}

		if (!metadata.mimetype) {
			return left(new BadRequestError("mimetype is required"));
		}

		const uuid = metadata.uuid ?? this.context.uuidGenerator.generate();
		const fid = metadata.fid ??
			this.context.fidGenerator.generate(metadata.title ?? uuid);

		const nodeOrErr = NodeFactory.from({ ...metadata, uuid, fid });
		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}

		const node = nodeOrErr.value;
		node.fulltext = await this.#calculateFulltext(node);
		const addOrErr = await this.context.repository.add(node);

		if (addOrErr.isLeft()) {
			return left(addOrErr.value);
		}

		return right(node);
	}

	async duplicate(uuid: string): Promise<Either<NodeNotFoundError, Node>> {
		const node = await this.get(uuid);

		if (node.isLeft()) {
			return left(node.value);
		}

		return this.copy(uuid, node.value.parent);
	}

	async copy(uuid: string, parent: string): Promise<Either<AntboxError, Node>> {
		const nodeOrErr = await this.get(uuid);
		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}

		if (Nodes.isFolder(nodeOrErr.value)) {
			return left(new BadRequestError("Cannot copy folder"));
		}

		const node = nodeOrErr.value;

		const fileOrErr = await this.context.storage.read(uuid);
		if (fileOrErr.isLeft()) {
			return left(fileOrErr.value);
		}

		const newUuid = this.context.uuidGenerator.generate();
		const title = `cópia de ${node.title}`;
		const fid = this.context.fidGenerator.generate(title);

		const metadata: Partial<NodeMetadata> = {
			uuid: newUuid,
			fid,
			mimetype: node.mimetype,
			title,
			parent: parent ?? node.parent,
		};

		if (Nodes.isFile(node)) {
			metadata.size = node.size;
		}

		const newNode = NodeFactory.from(metadata).right;

		const writeOrErr = await this.context.storage.write(
			newNode.uuid,
			fileOrErr.value,
			{
				title: newNode.title,
				parent: newNode.parent,
				mimetype: newNode.mimetype,
			},
		);
		if (writeOrErr.isLeft()) {
			return left(writeOrErr.value);
		}

		newNode.fulltext = await this.#calculateFulltext(newNode);

		const addOrErr = await this.context.repository.add(newNode);
		if (addOrErr.isLeft()) {
			return left(addOrErr.value);
		}

		return right(newNode);
	}

	#escapeFulltext(fulltext: string): string {
		return fulltext
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
			.trim();
	}

	async #calculateFulltext(node: NodeLike): Promise<string> {
		const fulltext = [node.title, node.description ?? ""];

		if (Nodes.hasAspects(node)) {
			const aspects = await this.#getNodeAspects(node);

			const propertiesFulltext: string[] = aspects
				.map((a) => this.#aspectToProperties(a))
				.flat()
				.filter((p) => p.searchable)
				.map((p) => p.name)
				.map((p) => node.properties[p] as string);

			fulltext.push(...propertiesFulltext);
		}

		return this.#escapeFulltext(fulltext.join(" "));
	}

	#aspectToProperties(aspect: AspectNode): AspectProperty[] {
		return aspect.properties.map((p) => {
			return { ...p, name: `${aspect.uuid}:${p.name}` };
		});
	}

	async updateFile(
		uuid: string,
		file: File,
	): Promise<Either<NodeNotFoundError, void>> {
		const nodeOrErr = await this.get(uuid);

		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}

		if (Nodes.isSmartFolder(nodeOrErr.value)) {
			const metadataText = await file.text();
			const metadata = JSON.parse(metadataText);
			return this.update(uuid, metadata);
		}

		if (!Nodes.isFileLike(nodeOrErr.value)) {
			return left(new NodeNotFoundError(uuid));
		}

		nodeOrErr.value.modifiedTime = new Date().toISOString();
		nodeOrErr.value.size = file.size;
		nodeOrErr.value.mimetype = file.type;

		await this.context.storage.write(uuid, file, {
			title: nodeOrErr.value.title,
			parent: nodeOrErr.value.parent,
			mimetype: nodeOrErr.value.mimetype,
		});

		nodeOrErr.value.fulltext = await this.#calculateFulltext(nodeOrErr.value);
		await this.context.repository.update(nodeOrErr.value);

		return right(undefined);
	}

	async delete(uuid: string): Promise<Either<NodeNotFoundError, void>> {
		const nodeOrError = await this.get(uuid);

		if (nodeOrError.isLeft()) {
			return left(nodeOrError.value);
		}

		return NodeDeleter.for(nodeOrError.value, this.context).delete();
	}

	async get(
		ctx: AuthenticationContext,
		uuid: string,
	): Promise<Either<NodeNotFoundError, NodeLike>> {
		if (uuid === Folders.ROOT_FOLDER_UUID || uuid === Folders.SYSTEM_FOLDER_UUID) {
			const folder = uuid === Folders.ROOT_FOLDER_UUID
				? Folders.ROOT_FOLDER
				: Folders.SYSTEM_FOLDER;

			if (await isPrincipalAllowedTo(this, ctx, folder, "Read")) {
				return right(folder);
			}
			return left(new ForbiddenError());
		}

		const nodeOrErr = await this.getFromRepository(uuid);
		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}

		if (await isPrincipalAllowedTo(this, ctx, nodeOrErr.value, "Read")) {
			return right(nodeOrErr.value);
		}

		return left(new ForbiddenError());
	}

	private getFromRepository(
		uuid: string,
	): Promise<Either<NodeNotFoundError, NodeLike>> {
		if (Nodes.isFid(uuid)) {
			return this.context.repository.getByFid(Nodes.uuidToFid(uuid));
		}
		return this.context.repository.getById(uuid);
	}

	async list(
		ctx: AuthenticationContext,
		parent = Folders.ROOT_FOLDER_UUID,
	): Promise<Either<FolderNotFoundError | ForbiddenError, Node[]>> {
		if (parent === Folders.SYSTEM_FOLDER_UUID) {
			return left(new FolderNotFoundError(parent));
		}

		const parentOrErr = await this.get(ctx, parent);
		if (parentOrErr.isLeft()) {
			return left(parentOrErr.value);
		}

		if (!Nodes.isFolder(parentOrErr.value)) {
			return left(new FolderNotFoundError(parent));
		}

		if ((await isPrincipalAllowedTo(this, ctx, parentOrErr.value, "Read")).isLeft()) {
			return left(new ForbiddenError());
		}

		if (Folders.isSystemRootFolder(parentOrErr.value)) {
			return right(this.#listSystemRootFolder());
		}

		const nodes = await this.context.repository
			.filter(
				[["parent", "==", parentOrErr.value.uuid]],
				Number.MAX_SAFE_INTEGER,
				1,
			)
			.then((result) => result.nodes);

		if (parent === Folders.ROOT_FOLDER_UUID) {
			return right([Folders.SYSTEM_FOLDER, ...nodes]);
		}

		return right(
			nodes.filter(async (n) =>
				!Nodes.isFolder(n) || (await isPrincipalAllowedTo(this, ctx, n, "Read")).isRight()
			),
		);
	}

	#listSystemRootFolder(): FolderNode[] {
		return Folders.SYSTEM_FOLDERS;
	}

	async find(
		filters: NodeFilter[],
		pageSize: number,
		pageToken = 1,
	): Promise<Either<AntboxError, NodeFilterResult>> {
		if (!filters.some((f) => f[0].startsWith("@"))) {
			return this.#findAll(filters, pageSize, pageToken);
		}

		const atfiltersOrErr = await this.#processAtFilters(filters);

		if (atfiltersOrErr.isLeft()) {
			return right({
				nodes: [],
				pageSize,
				pageToken,
				pageCount: 0,
			});
		}

		return this.#findAll(atfiltersOrErr.value, pageSize, pageToken);
	}

	async #findAll(
		filters: NodeFilter[],
		pageSize: number,
		pageToken: number,
	): Promise<Either<AntboxError, NodeFilterResult>> {
		const v = await this.context.repository.filter(
			filters,
			pageSize,
			pageToken,
		);

		const r = {
			nodes: v.nodes.map((n) => (Nodes.isApikey(n) ? n.cloneWithSecret() : n)),
			pageToken: v.pageToken,
			pageCount: v.pageCount,
			pageSize: v.pageSize,
		};

		return right(r);
	}

	async #processAtFilters(
		f: NodeFilter[],
	): Promise<Either<false, NodeFilter[]>> {
		const [at, filters] = f.reduce(
			(acc, cur) => {
				if (cur[0].startsWith("@")) {
					acc[0].push([cur[0].substring(1), cur[1], cur[2]]);
					return acc;
				}

				acc[1].push(cur);
				return acc;
			},
			[[], []] as [NodeFilter[], NodeFilter[]],
		);

		at.push(["mimetype", "==", Nodes.FOLDER_MIMETYPE]);

		const result = await this.context.repository.filter(
			at,
			Number.MAX_SAFE_INTEGER,
			1,
		);

		if (result.nodes.length === 0) {
			return left(false);
		}

		filters.push(["parent", "in", result.nodes.map((n) => n.uuid)]);

		return right(filters);
	}

	async update(
		uuid: string,
		data: Partial<NodeMetadata>,
		merge = false,
	): Promise<Either<NodeNotFoundError, void>> {
		const nodeOrErr = await this.get(uuid);

		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}

		if (Nodes.isApikey(nodeOrErr.value)) {
			return left(new BadRequestError("Cannot update apikey"));
		}

		const newNode = merge
			? this.#merge(nodeOrErr.value, data)
			: Object.assign(nodeOrErr.value, data);

		newNode.modifiedTime = new Date().toISOString();

		newNode.fulltext = await this.#calculateFulltext(newNode);
		return this.context.repository.update(newNode);
	}

	async #getNodeAspects(
		node: FileNode | FolderNode | MetaNode,
	): Promise<AspectNode[]> {
		if (!node.aspects || node.aspects.length === 0) {
			return [];
		}

		const nodesOrErrs = await Promise.all(node.aspects.map((a) => this.get(a)));

		return nodesOrErrs
			.filter((nodeOrErr) => nodeOrErr.isRight())
			.map((nodeOrErr) => nodeOrErr.value as AspectNode);
	}

	#merge<T>(dst: T, src: Partial<T>): T {
		const proto = Object.getPrototypeOf(dst);
		const result = Object.assign(Object.create(proto), dst);

		for (const key in src) {
			if (!src[key] && src[key] !== 0 && src[key] !== false) {
				delete result[key];
				continue;
			}

			if (typeof src[key] === "object") {
				// deno-lint-ignore no-explicit-any
				result[key] = this.#merge(result[key] ?? {}, src[key] as any);
				continue;
			}

			result[key] = src[key];
		}

		return result;
	}

	async evaluate(
		uuid: string,
	): Promise<
		Either<
			SmartFolderNodeNotFoundError | AggregationFormulaError,
			SmartFolderNodeEvaluation
		>
	> {
		const nodeOrErr = await this.context.repository.getById(uuid);

		if (nodeOrErr.isLeft()) {
			return left(new SmartFolderNodeNotFoundError(uuid));
		}

		if (!Nodes.isSmartFolder(nodeOrErr.value)) {
			return left(new SmartFolderNodeNotFoundError(uuid));
		}

		const node: SmartFolderNode = nodeOrErr.value;

		const evaluation = await this.context.repository
			.filter(node.filters, Number.MAX_SAFE_INTEGER, 1)
			.then((filtered) => ({ records: filtered.nodes }));

		if (node.hasAggregations()) {
			return this.appendAggregations(evaluation, node.aggregations!);
		}

		return right(evaluation);
	}

	private appendAggregations(
		evaluation: SmartFolderNodeEvaluation,
		aggregations: Aggregation[],
	): Either<AggregationFormulaError, SmartFolderNodeEvaluation> {
		const aggregationsMap = aggregations.map((aggregation) => {
			const formula = Reducers[aggregation.formula as string];

			if (!formula) {
				left(new AggregationFormulaError(aggregation.formula));
			}

			return right({
				title: aggregation.title,
				value: formula(evaluation.records as Node[], aggregation.fieldName),
			});
		});

		const err = aggregationsMap.find((aggregation) => aggregation.isLeft());

		if (err) {
			return left(err.value as AggregationFormulaError);
		}

		return right({
			...evaluation,
			aggregations: aggregationsMap.map(
				(aggregation) => aggregation.value as AggregationResult,
			),
		});
	}

	async export(uuid: string): Promise<Either<NodeNotFoundError, File>> {
		const nodeOrErr = await this.get(uuid);
		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}

		const node = nodeOrErr.value;

		const fileOrErr = await this.context.storage.read(uuid);
		if (fileOrErr.isLeft()) {
			return left(fileOrErr.value);
		}

		const type = this.#mapAntboxMimetypes(node.mimetype);
		const file = new File([fileOrErr.value], node.title, { type });

		return right(file);
	}

	#mapAntboxMimetypes(mimetype: string): string {
		const mimetypeMap = {
			[Nodes.ACTION_MIMETYPE]: "application/javascript",
			[Nodes.ASPECT_MIMETYPE]: "application/json",
			[Nodes.EXT_MIMETYPE]: "application/javascript",
			[Nodes.SMART_FOLDER_MIMETYPE]: "application/json",
		};

		return mimetypeMap[mimetype] ?? mimetype;
	}
}
