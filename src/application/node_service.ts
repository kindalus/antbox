import { Aspect, AspectProperty } from "../domain/aspects/aspect.ts";
import { AggregationFormulaError } from "../domain/nodes/aggregation_formula_error.ts";
import { FolderNode } from "../domain/nodes/folder_node.ts";
import { FolderNotFoundError } from "../domain/nodes/folder_not_found_error.ts";
import { Node } from "../domain/nodes/node.ts";
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

export interface NodeService {
	createFile(
		file: File,
		metadata: Partial<Node>,
	): Promise<Either<AntboxError, Node>>;

	createFolder(
		metadata: Partial<FolderNode>,
	): Promise<Either<AntboxError, FolderNode>>;

	createMetanode(metadata: Partial<Node>): Promise<Either<AntboxError, Node>>;

	duplicate(uuid: string): Promise<Either<NodeNotFoundError, Node>>;

	copy(uuid: string, parent: string): Promise<Either<NodeNotFoundError, Node>>;

	updateFile(
		uuid: string,
		file: File,
	): Promise<Either<NodeNotFoundError, void>>;

	delete(uuid: string): Promise<Either<NodeNotFoundError, void>>;

	get(uuid: string): Promise<Either<NodeNotFoundError, Node>>;

	list(parent?: string): Promise<Either<FolderNotFoundError, Node[]>>;

	query(
		filters: NodeFilter[],
		pageSize: number,
		pageToken?: number,
	): Promise<Either<AntboxError, NodeFilterResult>>;

	update(
		uuid: string,
		data: Partial<Node>,
		merge?: boolean,
	): Promise<Either<NodeNotFoundError, void>>;

	evaluate(
		uuid: string,
	): Promise<
		Either<
			SmartFolderNodeNotFoundError | AggregationFormulaError,
			SmartFolderNodeEvaluation
		>
	>;

	export(uuid: string): Promise<Either<NodeNotFoundError, File>>;
}

export class NodeServiceImpl implements NodeService {
	readonly #builtinNodeListCreator: Record<string, Node[]>;
	readonly #fileCreators: Record<
		string,
		(file: File, metadata: Partial<Node>) => Promise<Either<AntboxError, Node>>
	>;

	constructor(private readonly context: NodeServiceContext) {
		this.#builtinNodeListCreator = {};
		this.#builtinNodeListCreator[Node.ACTIONS_FOLDER_UUID] = builtinActions.map(actionToNode);
		this.#builtinNodeListCreator[Node.ASPECTS_FOLDER_UUID] = builtinAspects.map(aspectToNode);
		this.#builtinNodeListCreator[Node.USERS_FOLDER_UUID] = builtinUsers.map(userToNode);
		this.#builtinNodeListCreator[Node.GROUPS_FOLDER_UUID] = builtinGroups.map(groupToNode);

		this.#fileCreators = {};
		this.#fileCreators[Node.SMART_FOLDER_MIMETYPE] = (f, m) => this.#createSmartfolder(f, m);
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

		const validOrErr = await this.#verifyTitleAndParent(metadata);
		if (validOrErr.isLeft()) {
			return left(validOrErr.value);
		}

		const creator = this.#fileCreators[file.type];
		if (creator) {
			return creator(file, metadata);
		}

		const node = this.#createFileMetadata(metadata, file.type, file.size);

		let voidOrErr = await this.context.storage.write(node.uuid, file, {
			title: node.title,
			parent: node.parent,
		});
		if (voidOrErr.isLeft()) {
			return left(voidOrErr.value);
		}

		node.fulltext = await this.#calculateFulltext(node);

		voidOrErr = await this.context.repository.add(node);
		if (voidOrErr.isLeft()) {
			return left(voidOrErr.value);
		}

		return right(node);
	}

	async #verifyTitleAndParent(
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

	async #createSmartfolder(
		file: File,
		metadata: Partial<Node>,
	): Promise<Either<AntboxError, Node>> {
		let json: SmartFolderNode;
		try {
			const content = new TextDecoder().decode(await file.arrayBuffer());
			json = JSON.parse(content);
		} catch (_e) {
			return left(new BadRequestError("not a valid JSON file"));
		}

		json.mimetype = Node.SMART_FOLDER_MIMETYPE;

		const node = NodeFactory.composeSmartFolder(
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

		node.fulltext = await this.#calculateFulltext(node);

		const voidOrErr = await this.context.repository.add(node);
		if (voidOrErr.isLeft()) {
			return left(voidOrErr.value);
		}

		return right(node);
	}

	async createFolder(
		metadata: Partial<FolderNode>,
	): Promise<Either<AntboxError, FolderNode>> {
		const validOrErr = await this.#verifyTitleAndParent(metadata);
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
		const validOrErr = await this.#verifyTitleAndParent(metadata);
		if (validOrErr.isLeft()) {
			return left(validOrErr.value);
		}

		const node = this.#createFileMetadata(
			metadata,
			metadata.mimetype ?? Node.META_NODE_MIMETYPE,
			0,
		);

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

		if (nodeOrErr.value.isFolder()) {
			return left(new BadRequestError("Cannot copy folder"));
		}

		const fileOrErr = await this.context.storage.read(uuid);
		if (fileOrErr.isLeft()) {
			return left(fileOrErr.value);
		}

		const newNode = this.#createFileMetadata(
			{ title: `cópia de ${nodeOrErr.value.title}`, parent },
			nodeOrErr.value.mimetype,
			nodeOrErr.value.size,
		);

		const writeOrErr = await this.context.storage.write(
			newNode.uuid,
			fileOrErr.value,
			{
				title: newNode.title,
				parent: newNode.parent,
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

	async #calculateFulltext(node: Node): Promise<string> {
		const aspects = await this.#getNodeAspects(node);
		if (!node.aspects || node.aspects.length === 0) {
			return this.#escapeFulltext(node.title);
		}

		const fulltext = aspects
			.map((a) => this.#aspectToProperties(a))
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

		await this.context.storage.write(uuid, file, {
			title: nodeOrErr.value.title,
			parent: nodeOrErr.value.parent,
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

	#listSystemRootFolder(): FolderNode[] {
		return [
			FolderNode.ACTIONS_FOLDER,
			FolderNode.ASPECTS_FOLDER,
			FolderNode.USERS_FOLDER,
			FolderNode.GROUPS_FOLDER,
			FolderNode.EXT_FOLDER,
			FolderNode.OCR_TEMPLATES_FOLDER,
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

		if (parentOrErr.value.isSystemRootFolder()) {
			return right(this.#listSystemRootFolder());
		}

		const nodes = await this.context.repository
			.filter([["parent", "==", parentOrErr.value.uuid]], Number.MAX_VALUE, 1)
			.then((result) => result.nodes);

		const systemNodes = this.#builtinNodeListCreator[parentOrErr.value.uuid];
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
			? this.#merge(nodeOrErr.value, data)
			: Object.assign(nodeOrErr.value, data);

		newNode.fulltext = await this.#calculateFulltext(newNode);
		return this.context.repository.update(newNode);
	}

	#getNodeAspects(node: Node): Promise<Aspect[]> {
		const aspectGetters = node.aspects?.map((a) => this.context.storage.read(a));

		if (!aspectGetters) {
			return Promise.resolve([]);
		}

		return Promise.all(aspectGetters).then((fileOrErrs) => {
			fileOrErrs
				.filter((fileOrErr) => fileOrErr.isLeft())
				.map((fileOrErr) => fileOrErr.value)
				.forEach(console.error);

			const aspectsPromises = fileOrErrs
				.filter((fileOrErr) => fileOrErr.isRight())
				.map((fileOrErr) => fileOrErr.value as File)
				.map(fileToAspect);

			return Promise.all(aspectsPromises);
		});
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

		return this.context.storage.read(uuid);
	}

	#exportBuiltinNode(uuid: string): Either<NodeNotFoundError, File> {
		const builtinActionOrErr = this.#exportBuiltinAction(uuid);
		if (builtinActionOrErr.isRight()) {
			return right(
				new File([builtinActionOrErr.value], builtinActionOrErr.value.name, {
					type: "text/javascript",
				}),
			);
		}

		const builtinAspectOrErr = this.#exportBuiltinAspect(uuid);
		if (builtinAspectOrErr.isRight()) {
			return right(
				new File([builtinAspectOrErr.value], builtinAspectOrErr.value.name),
			);
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
