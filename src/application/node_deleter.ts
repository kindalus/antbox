import { FolderNode } from "../domain/nodes/folder_node.ts";
import { Node } from "../domain/nodes/node.ts";
import { NodeNotFoundError } from "../domain/nodes/node_not_found_error.ts";
import { Nodes } from "../domain/nodes/nodes.ts";
import { AntboxError } from "../shared/antbox_error.ts";
import { Either, right } from "../shared/either.ts";
import { NodeServiceContext } from "./node_service_context.ts";

export abstract class NodeDeleter<T extends Node> {
	static for(node: Node, context: NodeServiceContext): NodeDeleter<Node> {
		if (Nodes.isFolder(node)) {
			return new FolderNodeDeleter(node as FolderNode, context);
		}

		if (
			Nodes.isSmartFolder(node) ||
			Nodes.isMetaNode(node) ||
			Nodes.isAspect(node) ||
			Nodes.isApikey(node) ||
			Nodes.isUser(node) ||
			Nodes.isGroup(node)
		) {
			return new NonFileNodeDeleter(node as Node, context);
		}

		return new FileNodeDeleter(node as Node, context);
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

export class FileNodeDeleter extends NodeDeleter<Node> {
	constructor(node: Node, context: NodeServiceContext) {
		super(node, context);
	}

	delete(): Promise<Either<NodeNotFoundError, void>> {
		return this.deleteFromStorage().then((deletelOrErr) => {
			if (deletelOrErr.isLeft()) {
				return deletelOrErr;
			}

			return this.deleteFromRepository();
		});
	}
}

export class FolderNodeDeleter extends NodeDeleter<FolderNode> {
	constructor(node: FolderNode, context: NodeServiceContext) {
		super(node, context);
	}

	delete(): Promise<Either<AntboxError, void>> {
		return this.deleteChildren().then((deleteOrErr) => {
			if (deleteOrErr.isLeft()) {
				return deleteOrErr;
			}

			return this.deleteFromRepository();
		});
	}

	private async deleteChildren(): Promise<Either<AntboxError, void>> {
		const { nodes: children } = await this.context.repository.filter(
			[["parent", "==", this.node.uuid]],
			Number.MAX_SAFE_INTEGER,
			1,
		);

		for (const child of children) {
			const deleteOrErr = await NodeDeleter.for(child, this.context).delete();

			if (deleteOrErr.isLeft()) {
				return deleteOrErr;
			}
		}

		return right(undefined);
	}
}

export class NonFileNodeDeleter extends NodeDeleter<Node> {
	delete(): Promise<Either<NodeNotFoundError, void>> {
		return this.deleteFromRepository();
	}
	constructor(node: Node, context: NodeServiceContext) {
		super(node, context);
	}
}
