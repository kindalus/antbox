import {
	NodeFilterResult,
	NodeService,
	NodeServiceContext,
	SmartFolderNodeEvaluation,
} from "./node_service.ts";

import {
	Aggregation,
	FileNode,
	FOLDER_MIMETYPE,
	FolderNode,
	isFid,
	Node,
	NodeFilter,
	ROOT_FOLDER_UUID,
	SMART_FOLDER_MIMETYPE,
	SmartFolderNode,
	uuidToFid,
} from "./node.ts";

import FolderNotFoundError from "./folder_not_found_error.ts";
import SmartFolderNodeNotFoundError from "./smart_folder_node_not_found_error.ts";
import NodeNotFoundError from "./node_not_found_error.ts";
import InvalidNodeToCopyError from "./invalid_node_to_copy_error.ts";

import { RequestContext } from "./request_context.ts";
import DefaultFidGenerator from "../strategies/default_fid_generator.ts";
import DefaultUuidGenerator from "../strategies/default_uuid_generator.ts";

export default class DefaultNodeService implements NodeService {
	private readonly context: NodeServiceContext;

	constructor(context: NodeServiceContext) {
		this.context = {
			fidGenerator: context.fidGenerator ?? new DefaultFidGenerator(),
			uuidGenerator: context.uuidGenerator ?? new DefaultUuidGenerator(),
			storage: context.storage,
			repository: context.repository,
		};
	}

	async createFile(
		request: RequestContext,
		file: File,
		parent = ROOT_FOLDER_UUID,
	): Promise<string> {
		const node = this.createFileMetadata(
			request,
			parent,
			file.name,
			file.type,
			file.size,
		);

		await this.context.storage.write(node.uuid, file);
		await this.context.repository.add(node);

		return Promise.resolve(node.uuid);
	}
	/*
  private async addToParentFolderNodeMetadata(parent: string, node: Node) {
    const parentNode =
      (await this.context.repository.getById(parent)) as FolderNode;

    if (!parentNode) throw new FolderNotFoundError(parent);

    parentNode.children = [...(parentNode.children ?? []), node.uuid];

    this.context.repository.update(parentNode);
  }
  */
	createFolder(
		request: RequestContext,
		title: string,
		parent = ROOT_FOLDER_UUID,
	): Promise<string> {
		const node = this.createFolderMetadata(request, parent, title);

		this.context.repository.add(node);

		return Promise.resolve(node.uuid);
	}

	private isRootFolder(parent: string) {
		return parent === ROOT_FOLDER_UUID;
	}

	private createFileMetadata(
		request: RequestContext,
		parent: string,
		title: string,
		mimetype: string,
		size: number,
	): Node {
		return {
			uuid: this.context.uuidGenerator!.generate(),
			fid: this.context.fidGenerator!.generate(title),
			title,
			parent,
			mimetype,
			owner: request.getUserId(),
			starred: false,
			trashed: false,
			size,
			createdTime: now(),
			modifiedTime: now(),
		};
	}

	private createFolderMetadata(
		request: RequestContext,
		parent: string,
		title: string,
	): FolderNode {
		return {
			...this.createFileMetadata(
				request,
				parent,
				title,
				FOLDER_MIMETYPE,
				0,
			),
			children: [],
			onCreate: [],
			onUpdate: [],
		};
	}

	async copy(request: RequestContext, uuid: string): Promise<string> {
		const node = await this.get(request, uuid);
		const file = await this.context.storage.read(uuid);

		if (!this.isFileNode(node)) throw new InvalidNodeToCopyError(uuid);

		const newNode = this.createFileMetadata(
			request,
			node.parent ?? ROOT_FOLDER_UUID,
			node.title,
			node.mimetype,
			0,
		);

		await this.context.storage.write(newNode.uuid, file);
		await this.context.repository.add(newNode);

		return Promise.resolve(newNode.uuid);
	}

	async updateFile(
		request: RequestContext,
		uuid: string,
		file: File,
	): Promise<void> {
		const node = await this.get(request, uuid);

		node.modifiedTime = now();
		node.size = file.size;
		node.mimetype = file.type;

		await this.context.storage.write(uuid, file);

		await this.context.repository.update(node);
	}

	async delete(request: RequestContext, uuid: string): Promise<void> {
		const node = await this.get(request, uuid);

		return NodeDeleter.for(node, this.context).delete();
	}

	async get(_request: RequestContext, uuid: string): Promise<Node> {
		const node = await this.getFromRepository(uuid);

		if (!node) throw new NodeNotFoundError(uuid);

		return node;
	}

	private getFromRepository(uuid: string): Promise<Node | undefined> {
		if (isFid(uuid)) {
			return this.context.repository.getByFid(uuidToFid(uuid));
		}
		return this.context.repository.getById(uuid);
	}

	async list(
		_request: RequestContext,
		parent = ROOT_FOLDER_UUID,
	): Promise<Node[]> {
		if (!this.isRootFolder(parent)) {
			const parentFolder = await this.context.repository.getById(parent);

			if (parentFolder?.mimetype !== FOLDER_MIMETYPE) {
				throw new FolderNotFoundError(parent);
			}
		}

		return this.context.repository
			.filter([["parent", "==", parent]], Number.MAX_VALUE, 1)
			.then((result) => result.nodes);
	}

	query(
		_request: RequestContext,
		constraints: NodeFilter[],
		pageSize = 25,
		pageToken = 1,
	): Promise<NodeFilterResult> {
		return this.context.repository.filter(constraints, pageSize, pageToken);
	}

	async update(
		request: RequestContext,
		uuid: string,
		data: Partial<Node>,
	): Promise<void> {
		const node = await this.get(request, uuid);

		if (!node) throw new NodeNotFoundError(uuid);

		await this.context.repository.update({ ...node, ...data });
	}

	async evaluate(
		_request: RequestContext,
		uuid: string,
	): Promise<SmartFolderNodeEvaluation> {
		const node =
			(await this.context.repository.getById(uuid)) as SmartFolderNode;

		if (!this.isSmartFolderNode(node)) {
			throw new SmartFolderNodeNotFoundError(uuid);
		}

		const evaluation = await this.context.repository
			.filter(node.filters, Number.MAX_VALUE, 1)
			.then((filtered) => ({ records: filtered.nodes }));

		if (this.hasAggregations(node)) {
			return this.appendAggregations(
				evaluation,
				node.aggregations as Aggregation[],
			);
		}

		return Promise.resolve(evaluation);
	}

	private appendAggregations(
		evaluation: SmartFolderNodeEvaluation,
		aggregations: Aggregation[],
	) {
		const aggregationsMap = aggregations.map((aggregation) => {
			const formula = Reducers[aggregation.formula as string];

			if (!formula) throw "Invalid formula: " + aggregation.formula;

			return {
				title: aggregation.title,
				value: formula(
					evaluation.records as Node[],
					aggregation.fieldName,
				),
			};
		});

		return Promise.resolve({
			...evaluation,
			aggregations: aggregationsMap,
		});
	}

	private hasAggregations(node: SmartFolderNode): boolean {
		return node.aggregations !== null && node.aggregations !== undefined;
	}

	private isSmartFolderNode(node: Node) {
		return node?.mimetype === SMART_FOLDER_MIMETYPE;
	}

	private isFolderNode(node: Node) {
		return node?.mimetype === FOLDER_MIMETYPE;
	}

	private isFileNode(node: Node): boolean {
		return !this.isSmartFolderNode(node) && !this.isFolderNode(node);
	}

	async export(request: RequestContext, uuid: string): Promise<Blob> {
		const node = await this.get(request, uuid);
		const blob = await this.context.storage.read(node.uuid);

		return blob;
	}
}

abstract class NodeDeleter<T extends Node> {
	static for(
		node: Node,
		context: NodeServiceContext,
	): NodeDeleter<Node> {
		switch (node.mimetype) {
			case FOLDER_MIMETYPE:
				return new FolderNodeDeleter(node as FolderNode, context);
			case SMART_FOLDER_MIMETYPE:
				return new SmartFolderNodeDeleter(
					node as SmartFolderNode,
					context,
				);
		}

		return new FileNodeDeleter(node as FileNode, context);
	}

	protected readonly node: T;
	protected readonly context: NodeServiceContext;

	constructor(node: T, context: NodeServiceContext) {
		this.node = node;
		this.context = context;
	}

	abstract delete(): Promise<void>;

	protected deleteFromRepository(): Promise<void> {
		return this.context.repository.delete(this.node.uuid);
	}

	protected deleteFromStorage(): Promise<void> {
		return this.context.storage.delete(this.node.uuid);
	}
}

class FileNodeDeleter extends NodeDeleter<FileNode> {
	constructor(node: FileNode, context: NodeServiceContext) {
		super(node, context);
	}

	delete(): Promise<void> {
		return this.deleteFromStorage().then(() => this.deleteFromRepository());
	}
}

class FolderNodeDeleter extends NodeDeleter<FolderNode> {
	constructor(node: FolderNode, context: NodeServiceContext) {
		super(node, context);
	}

	async delete(): Promise<void> {
		await this.deleteChildren();
		return this.deleteFromRepository();
	}

	private async deleteChildren() {
		const { nodes: children } = await this.context.repository.filter(
			[["parent", "==", this.node.uuid]],
			Number.MAX_VALUE,
			1,
		);

		for (const child of children) {
			await NodeDeleter.for(child, this.context).delete();
		}
	}
}

class SmartFolderNodeDeleter extends NodeDeleter<SmartFolderNode> {
	delete(): Promise<void> {
		return this.deleteFromStorage();
	}
	constructor(node: SmartFolderNode, context: NodeServiceContext) {
		super(node, context);
	}
}

function now() {
	return new Date().toISOString();
}

type AggregatorFn<T> = (acc: T, curValue: unknown) => T;
type ReducerFn = (nodes: Node[], fieldName: string) => unknown;

function calculateAggregation<T>(
	fn: AggregatorFn<T>,
	initialValue: T,
	nodes: Node[],
	field: string,
): T {
	return nodes.reduce((acc, node) => {
		const value = node[field] ?? node.properties?.[field];

		if (!value) throw "field not found " + field;

		return fn(acc, value);
	}, initialValue);
}

const Reducers: Record<string, ReducerFn> = {
	sum(nodes: Node[], fieldName: string) {
		const fn = (acc: number, curValue: number) =>
			acc + (curValue as number);
		return calculateAggregation(
			fn as AggregatorFn<unknown>,
			0,
			nodes,
			fieldName,
		);
	},

	avg(nodes: Node[], fieldName: string) {
		const fn =
			((acc: number, curValue: number) =>
				acc + (curValue as number)) as AggregatorFn<unknown>;

		const sum = calculateAggregation(fn, 0, nodes, fieldName);

		return (sum as number) / nodes.length;
	},

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	count(nodes: Node[], _fieldName: string) {
		return nodes.length;
	},

	max(nodes: Node[], fieldName: string) {
		const fn = (
			acc: number,
			curValue: number,
		) => (acc > curValue ? acc : curValue);
		return calculateAggregation(
			fn as AggregatorFn<unknown>,
			undefined,
			nodes,
			fieldName,
		);
	},

	min(nodes: Node[], fieldName: string) {
		const fn = (
			acc: number,
			curValue: number,
		) => (acc < curValue ? acc : curValue);
		return calculateAggregation(
			fn as AggregatorFn<unknown>,
			undefined,
			nodes,
			fieldName,
		);
	},

	med(nodes: Node[], fieldName: string) {
		const values = nodes
			.map((node) => node[fieldName] ?? node.properties?.[fieldName])
			.sort(<T>(a: T, b: T) => (a > b ? 1 : -1));

		if (values.length === 0) return undefined;

		return values[Math.floor(values.length / 2)];
	},
};
