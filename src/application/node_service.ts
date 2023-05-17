import { Aspect, AspectProperty } from "../domain/aspects/aspect.ts";
import { AggregationFormulaError } from "../domain/nodes/aggregation_formula_error.ts";
import { FolderNode } from "../domain/nodes/folder_node.ts";
import { FolderNotFoundError } from "../domain/nodes/folder_not_found_error.ts";
import { FileNode, Node } from "../domain/nodes/node.ts";
import { NodeFactory } from "../domain/nodes/node_factory.ts";
import { NodeFilter } from "../domain/nodes/node_filter.ts";
import { NodeNotFoundError } from "../domain/nodes/node_not_found_error.ts";
import { NodeFilterResult } from "../domain/nodes/node_repository.ts";
import {
	AggregationResult,
	Reducers,
	SmartFolderNodeEvaluation,
} from "../domain/nodes/smart_folder_evaluation.ts";
import { Aggregation, SmartFolderNode } from "../domain/nodes/smart_folder_node.ts";
import { SmartFolderNodeNotFoundError } from "../domain/nodes/smart_folder_node_not_found_error.ts";
import { AntboxError, BadRequestError } from "../shared/antbox_error.ts";
import { Either, left, right } from "../shared/either.ts";
import { ActionService } from "./action_service.ts";
import { builtinActions } from "./builtin_actions/mod.ts";
import { builtinAspects } from "./builtin_aspects/mod.ts";
import { builtinGroups } from "./builtin_groups/mod.ts";
import { builtinUsers } from "./builtin_users/mod.ts";
import { NodeDeleter } from "./node_deleter.ts";
import {
	actionToNode,
	aspectToFile,
	aspectToNode,
	fileToAspect,
	groupToNode,
	userToNode,
} from "./node_mapper.ts";
import { NodeServiceContext } from "./node_service_context.ts";

export class NodeService {
	readonly #systemListCreator: Record<string, Node[]>;

	constructor(private readonly context: NodeServiceContext) {
		this.#systemListCreator = {};
		this.#systemListCreator[Node.ACTIONS_FOLDER_UUID] = builtinActions.map(actionToNode);
		this.#systemListCreator[Node.ASPECTS_FOLDER_UUID] = builtinAspects.map(aspectToNode);
		this.#systemListCreator[Node.USERS_FOLDER_UUID] = builtinUsers.map(userToNode);
		this.#systemListCreator[Node.GROUPS_FOLDER_UUID] = builtinGroups.map(groupToNode);
	}

	get uuidGenerator() {
		return this.context.uuidGenerator;
	}

	get fidGenerator() {
		return this.context.fidGenerator;
	}

	get storage() {
		return this.context.storage;
	}

	get repository() {
		return this.context.repository;
	}

	async createFile(
		file: File,
		metadata: Partial<Node>,
	): Promise<Either<AntboxError, Node>> {
		metadata.title = metadata.title ?? file.name;

		const validOrErr = await this.verifyTitleAndParent(metadata);
		if (validOrErr.isLeft()) {
			return left(validOrErr.value);
		}

		let node: FileNode | SmartFolderNode | undefined;
		if (file.type === "application/json") {
			node = await this.tryToCreateSmartfolder(file, metadata);
		}

		if (!node) {
			node = this.#createFileMetadata(metadata, file.type, file.size);
		}

		if (!node.isSmartFolder()) {
			await this.context.storage.write(node.uuid, file);
		}

		node.fulltext = await this.#calculateFulltext(node);
		await this.context.repository.add(node);

		return right(node);
	}

	private async verifyTitleAndParent(
		metadata: Partial<Node>,
	): Promise<Either<AntboxError, true>> {
		if (!metadata.title) {
			return left(new BadRequestError("title"));
		}

		const parentUuid = metadata.parent ?? Node.ROOT_FOLDER_UUID;
		const parentOrErr = await this.get(parentUuid);
		if (parentOrErr.isLeft()) {
			return left(new FolderNotFoundError(parentUuid));
		}

		return right(true);
	}

	private async tryToCreateSmartfolder(
		file: File,
		metadata: Partial<Node>,
	): Promise<SmartFolderNode | undefined> {
		try {
			const content = new TextDecoder().decode(await file.arrayBuffer());
			const json = JSON.parse(content);

			if (json.mimetype !== Node.SMART_FOLDER_MIMETYPE) {
				return undefined;
			}

			return NodeFactory.composeSmartFolder(
				{
					uuid: this.context.uuidGenerator!.generate(),
					fid: this.context.fidGenerator!.generate(metadata.title!),
					size: 0,
				},
				NodeFactory.extractMetadataFields(metadata),
				{
					filters: json.filters,
					aggregations: json.aggregations,
					title: json.title,
				},
			);
		} catch (_e) {
			return undefined;
		}
	}

	async createFolder(
		metadata: Partial<FolderNode>,
	): Promise<Either<AntboxError, FolderNode>> {
		const validOrErr = await this.verifyTitleAndParent(metadata);
		if (validOrErr.isLeft()) {
			return left(validOrErr.value);
		}

		const node = NodeFactory.createFolderMetadata(
			metadata.uuid ?? this.context.uuidGenerator.generate(),
			metadata.fid ?? this.context.fidGenerator.generate(metadata.title!),
			metadata,
		);

		node.fulltext = await this.#calculateFulltext(node);
		await this.context.repository.add(node);

		return right(node);
	}

	async createMetanode(
		metadata: Partial<Node>,
	): Promise<Either<AntboxError, Node>> {
		const validOrErr = await this.verifyTitleAndParent(metadata);
		if (validOrErr.isLeft()) {
			return left(validOrErr.value);
		}

		const node = this.#createFileMetadata(
			metadata,
			metadata.mimetype ?? Node.META_NODE_MIMETYPE,
			0,
		);

		node.fulltext = await this.#calculateFulltext(node);
		await this.context.repository.add(node);

		return right(node);
	}

	async duplicate(uuid: string): Promise<Either<NodeNotFoundError, Node>> {
		const node = await this.get(uuid);

		if (node.isLeft()) {
			return left(node.value);
		}

		return this.copy(uuid, node.value.parent);
	}

	async copy(
		uuid: string,
		parent: string,
	): Promise<Either<NodeNotFoundError, Node>> {
		const nodeOrErr = await this.get(uuid);
		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}

		if (nodeOrErr.value.isFolder()) {
			return left(new BadRequestError("Cannot copy folder"));
		}

		const file = await this.context.storage.read(uuid);

		const newNode = this.#createFileMetadata(
			{ title: "cópia de ".concat(nodeOrErr.value.title), parent },
			nodeOrErr.value.mimetype,
			nodeOrErr.value.size,
		);

		await this.context.storage.write(newNode.uuid, file);
		newNode.fulltext = await this.#calculateFulltext(newNode);
		await this.context.repository.add(newNode);

		return right(newNode);
	}

	#escapeFulltext(fulltext: string): string {
		return fulltext.toLocaleLowerCase()
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

	async #calculateFulltext(node: Node): Promise<string> {
		// Get all node aspect properties and filter the ones with searchable = true
		if (!node.aspects || node.aspects.length === 0) {
			return this.#escapeFulltext(node.title);
		}

		const aspectGetters = node.aspects.map((a) => this.context.storage.read(a));

		const files = await Promise.all(aspectGetters);
		const aspects = await Promise.all(files.map(fileToAspect));
		const fulltext = aspects.map((a) => this.#aspectToProperties(a))
			.flat()
			.filter((p) => p.searchable)
			.map((p) => p.name)
			.map((p) => node.properties[p]);

		return this.#escapeFulltext([node.title, ...fulltext].join(" "));
	}

	#aspectToProperties(aspect: Aspect): AspectProperty[] {
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

		nodeOrErr.value.modifiedTime = new Date().toISOString();
		nodeOrErr.value.size = file.size;
		nodeOrErr.value.mimetype = file.type;

		await this.context.storage.write(uuid, file);

		nodeOrErr.value.fulltext = await this.#calculateFulltext(nodeOrErr.value);
		await this.context.repository.update(nodeOrErr.value);

		return right(undefined);
	}

	async delete(uuid: string): Promise<Either<NodeNotFoundError, void>> {
		const nodeOrError = await this.get(uuid);

		if (nodeOrError.isLeft()) {
			return left(nodeOrError.value);
		}

		await NodeDeleter.for(nodeOrError.value, this.context).delete();

		return right(undefined);
	}

	async get(uuid: string): Promise<Either<NodeNotFoundError, Node>> {
		const systemFolderOrErr = this.#getSystemFolder(uuid);
		if (systemFolderOrErr.isRight()) {
			return right(systemFolderOrErr.value);
		}

		const builtinActionOrErr = await this.getBuiltinAction(uuid);
		if (builtinActionOrErr.isRight()) {
			return right(builtinActionOrErr.value);
		}

		const builtinAspectOrErr = await this.getBuiltinAspect(uuid);
		if (builtinAspectOrErr.isRight()) {
			return right(builtinAspectOrErr.value);
		}

		return this.getFromRepository(uuid);
	}

	#listSystemFolders(): FolderNode[] {
		return [
			FolderNode.ACTIONS_FOLDER,
			FolderNode.ASPECTS_FOLDER,
			FolderNode.USERS_FOLDER,
			FolderNode.GROUPS_FOLDER,
			FolderNode.EXT_FOLDER,
		];
	}

	#getSystemFolder(uuid: string): Either<FolderNotFoundError, FolderNode> {
		const nodes: FolderNode[] = [
			FolderNode.ROOT_FOLDER,
			FolderNode.SYSTEM_FOLDER,
			FolderNode.ACTIONS_FOLDER,
			FolderNode.ASPECTS_FOLDER,
			FolderNode.USERS_FOLDER,
			FolderNode.GROUPS_FOLDER,
			FolderNode.EXT_FOLDER,
		];

		const node = nodes.find((n) => n.uuid === uuid);

		if (!node) {
			return left(new FolderNotFoundError(uuid));
		}

		return right(node);
	}

	#createFileMetadata(metadata: Partial<Node>, mimetype: string, size: number) {
		const uuid = metadata.uuid ?? this.context.uuidGenerator.generate();
		const fid = metadata.fid ??
			this.context.fidGenerator.generate(metadata.title ?? uuid);

		return NodeFactory.createFileMetadata(uuid, fid, metadata, mimetype, size);
	}

	private getBuiltinAction(
		uuid: string,
	): Promise<Either<NodeNotFoundError, Node>> {
		const action = builtinActions.find((a) => a.uuid === uuid);

		if (!action) {
			return Promise.resolve(left(new NodeNotFoundError(uuid)));
		}

		return Promise.resolve(right(actionToNode(action)));
	}

	private getBuiltinAspect(
		uuid: string,
	): Promise<Either<NodeNotFoundError, Node>> {
		const aspect = builtinAspects.find((a) => a.uuid === uuid);

		if (!aspect) {
			return Promise.resolve(left(new NodeNotFoundError(uuid)));
		}

		return Promise.resolve(right(aspectToNode(aspect)));
	}

	private getFromRepository(
		uuid: string,
	): Promise<Either<NodeNotFoundError, Node>> {
		if (Node.isFid(uuid)) {
			return this.context.repository.getByFid(Node.uuidToFid(uuid));
		}
		return this.context.repository.getById(uuid);
	}

	async list(
		parent = Node.ROOT_FOLDER_UUID,
	): Promise<Either<FolderNotFoundError, Node[]>> {
		const parentOrErr = await this.get(parent);
		if (parentOrErr.isLeft()) {
			return left(new FolderNotFoundError(parent));
		}

		if (parentOrErr.value.isSystemFolder()) {
			return right(this.#listSystemFolders());
		}

		const nodes = await this.context.repository
			.filter([["parent", "==", parentOrErr.value.uuid]], Number.MAX_VALUE, 1)
			.then((result) => result.nodes);

		const systemNodes = this.#systemListCreator[parentOrErr.value.uuid];
		if (systemNodes) {
			return right([...systemNodes, ...nodes]);
		}

		if (parent === Node.ROOT_FOLDER_UUID) {
			return right([FolderNode.SYSTEM_FOLDER, ...nodes]);
		}

		return right(nodes);
	}

	query(
		filters: NodeFilter[],
		pageSize: number,
		pageToken = 1,
	): Promise<Either<AntboxError, NodeFilterResult>> {
		return this.context.repository
			.filter(filters, pageSize, pageToken)
			.then((v) => right(v));
	}

	async update(
		uuid: string,
		data: Partial<Node>,
		merge = false,
	): Promise<Either<NodeNotFoundError, void>> {
		const nodeOrErr = await this.get(uuid);

		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}

		const newNode = merge
			? this.merge(nodeOrErr.value, data)
			: Object.assign(nodeOrErr.value, data);

		newNode.fulltext = await this.#calculateFulltext(newNode);
		return this.context.repository.update(newNode);
	}

	private merge<T>(dst: T, src: Partial<T>): T {
		const proto = Object.getPrototypeOf(dst);
		const result = Object.assign(Object.create(proto), dst);

		for (const key in src) {
			if (!src[key] && src[key] !== 0 && src[key] !== false) {
				delete result[key];
				continue;
			}

			if (typeof src[key] === "object") {
				// deno-lint-ignore no-explicit-any
				result[key] = this.merge(result[key] ?? {}, src[key] as any);
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

		if (!nodeOrErr.value.isSmartFolder()) {
			return left(new SmartFolderNodeNotFoundError(uuid));
		}

		const node = nodeOrErr.value;

		const evaluation = await this.context.repository
			.filter(node.filters, Number.MAX_VALUE, 1)
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
		const builtinOrErr = this.#exportBuiltinNode(uuid);
		if (builtinOrErr.isRight()) {
			return builtinOrErr;
		}

		const nodeOrErr = await this.get(uuid);

		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}

		if (nodeOrErr.value.isSmartFolder()) {
			return right(this.#exportSmartfolder(nodeOrErr.value));
		}

		const file = await this.context.storage.read(uuid);

		return right(file);
	}

	#exportBuiltinNode(uuid: string): Either<NodeNotFoundError, File> {
		const builtinActionOrErr = this.#exportBuiltinAction(uuid);
		if (builtinActionOrErr.isRight()) {
			return builtinActionOrErr;
		}

		const builtinAspectOrErr = this.#exportBuiltinAspect(uuid);
		if (builtinAspectOrErr.isRight()) {
			return builtinAspectOrErr;
		}

		return left(new NodeNotFoundError(uuid));
	}

	#exportBuiltinAction(uuid: string): Either<NodeNotFoundError, File> {
		const action = builtinActions.find((action) => action.uuid === uuid);

		if (!action) {
			return left(new NodeNotFoundError(uuid));
		}

		return right(ActionService.actionToFile(action));
	}

	#exportBuiltinAspect(uuid: string): Either<NodeNotFoundError, File> {
		const aspect = builtinAspects.find((aspect) => aspect.uuid === uuid);

		if (!aspect) {
			return left(new NodeNotFoundError(uuid));
		}

		return right(aspectToFile(aspect));
	}

	#exportSmartfolder(node: Node): File {
		const jsonText = JSON.stringify(node);

		return new File([jsonText], node.title.concat(".json"), {
			type: "application/json",
		});
	}
}
