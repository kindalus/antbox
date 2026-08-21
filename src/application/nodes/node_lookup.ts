import type { NodeLike } from "domain/node_like.ts";
import { FolderNode } from "domain/nodes/folder_node.ts";
import { FolderNotFoundError } from "domain/nodes/folder_not_found_error.ts";
import type { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";
import type { NodeRepository } from "domain/nodes/node_repository.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import type { Either } from "shared/either.ts";
import { left, right } from "shared/either.ts";
import { createRootFolder } from "./root_folder.ts";

export class NodeLookup {
	constructor(private readonly repository: NodeRepository) {}

	async getStored(uuid: string): Promise<Either<NodeNotFoundError, NodeLike>> {
		if (Nodes.isFid(uuid)) {
			return await this.repository.getByFid(Nodes.uuidToFid(uuid));
		}
		return this.repository.getById(uuid);
	}

	async get(uuid: string): Promise<Either<NodeNotFoundError, NodeLike>> {
		return this.#isRoot(uuid) ? right(createRootFolder()) : this.getStored(uuid);
	}

	async getFolder(uuid: string): Promise<Either<NodeNotFoundError, FolderNode>> {
		if (this.#isRoot(uuid)) {
			return right(createRootFolder());
		}

		const nodeOrErr = await this.getStored(uuid);
		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}
		return Nodes.isFolder(nodeOrErr.value)
			? right(nodeOrErr.value)
			: left(new FolderNotFoundError(uuid));
	}

	async listChildren(uuid: string): Promise<NodeLike[]> {
		const pageSize = 500;
		const children: NodeLike[] = [];

		for (let pageToken = 1;; pageToken++) {
			const page = await this.repository.filter(
				[["parent", "==", uuid]],
				pageSize,
				pageToken,
			);
			children.push(...page.nodes);
			if (page.nodes.length < pageSize) {
				return children;
			}
		}
	}

	#isRoot(uuid: string): boolean {
		const key = Nodes.isFid(uuid) ? Nodes.uuidToFid(uuid) : uuid;
		return key === Nodes.ROOT_FOLDER_UUID;
	}
}
