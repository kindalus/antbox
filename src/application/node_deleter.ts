import { FolderNode } from "../domain/nodes/folder_node.ts";
import { FileNode, Node } from "../domain/nodes/node.ts";
import { NodeNotFoundError } from "../domain/nodes/node_not_found_error.ts";
import { SmartFolderNode } from "../domain/nodes/smart_folder_node.ts";
import { AntboxError } from "../shared/antbox_error.ts";
import { Either } from "../shared/either.ts";
import { NodeServiceContext } from "./node_service_context.ts";

export abstract class NodeDeleter<T extends Node> {
	static for(node: Node, context: NodeServiceContext): NodeDeleter<Node> {
		if (node.isFolder()) {
			return new FolderNodeDeleter(node as FolderNode, context);
		}

		if (node.isSmartFolder()) {
			return new SmartFolderNodeDeleter(node as SmartFolderNode, context);
		}

		if (node.isMetaNode()) {
			return new MetaNodeDeleter(node as Node, context);
		}

		return new FileNodeDeleter(node as FileNode, context);
	}

	protected readonly node: T;
	protected readonly context: NodeServiceContext;

	protected constructor(node: T, context: NodeServiceContext) {
		this.node = node;
		this.context = context;
	}

	abstract delete(): Promise<Either<NodeNotFoundError, void>>;

	protected deleteFromRepository(): Promise<Either<NodeNotFoundError, void>> {
		return this.context.repository.delete(this.node.uuid);
	}

	protected deleteFromStorage(): Promise<Either<AntboxError, void>> {
		return this.context.storage.delete(this.node.uuid);
	}
}

export class MetaNodeDeleter extends NodeDeleter<Node> {
	constructor(node: Node, context: NodeServiceContext) {
		super(node, context);
	}

	delete(): Promise<Either<NodeNotFoundError, void>> {
		return this.deleteFromRepository();
	}
}

export class FileNodeDeleter extends NodeDeleter<FileNode> {
	constructor(node: FileNode, context: NodeServiceContext) {
		super(node, context);
	}

	delete(): Promise<Either<NodeNotFoundError, void>> {
		return this.deleteFromStorage();
	}
}

export class FolderNodeDeleter extends NodeDeleter<FolderNode> {
	constructor(node: FolderNode, context: NodeServiceContext) {
		super(node, context);
	}

	async delete(): Promise<Either<NodeNotFoundError, void>> {
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

export class SmartFolderNodeDeleter extends NodeDeleter<SmartFolderNode> {
	delete(): Promise<Either<NodeNotFoundError, void>> {
		return this.deleteFromRepository();
	}
	constructor(node: SmartFolderNode, context: NodeServiceContext) {
		super(node, context);
	}
}
