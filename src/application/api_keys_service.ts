import { ApiKeyNodeFoundError } from "../domain/api_keys/api_key_node_found_error.ts";
import GroupNotFoundError from "../domain/auth/group_not_found_error.ts";
import { UserNotFoundError } from "../domain/auth/user_not_found_error.ts";
import { ApiKeyNode } from "../domain/nodes/api_key_node.ts";
import { Node } from "../domain/nodes/node.ts";
import { UuidGenerator } from "../domain/providers/uuid_generator.ts";
import { AntboxError } from "../shared/antbox_error.ts";
import { Either, left, right } from "../shared/either.ts";
import { NodeService } from "./node_service.ts";

export class ApiKeyService {
	readonly #nodeService: NodeService;
	readonly #uuidGenerator: UuidGenerator;

	constructor(nodeService: NodeService, uuidGenerator: UuidGenerator) {
		this.#nodeService = nodeService;
		this.#uuidGenerator = uuidGenerator;
	}

	async create(group: string, owner: string): Promise<Either<AntboxError, ApiKeyNode>> {
		const groupsOrErr = await this.#nodeService.get(group);
		if (groupsOrErr.isLeft()) {
			return left(groupsOrErr.value);
		}

		if (!groupsOrErr.value.isGroup()) {
			return left(new GroupNotFoundError(group));
		}

		const apiKey = new ApiKeyNode(group, this.#uuidGenerator.generate(10));

		const metadata = {
			title: apiKey.title,
			secret: apiKey.secret,
			mimetype: apiKey.mimetype,
			parent: apiKey.parent,
			group,
			owner,
		};

		const nodeOrErr = await this.#nodeService.createMetanode(metadata);
		return nodeOrErr as Either<AntboxError, ApiKeyNode>;
	}

	async get(uuid: string): Promise<Either<AntboxError, ApiKeyNode>> {
		const nodeOrErr = await this.#nodeService.get(uuid);

		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}

		if (!nodeOrErr.value.isApikey) {
			return left(new ApiKeyNodeFoundError(uuid));
		}

		const node = nodeOrErr.value;
		if (!node.isApikey()) {
			return left(new UserNotFoundError(uuid));
		}

		return right(node.cloneWithSecret());
	}

	async getBySecret(secret: string): Promise<Either<AntboxError, ApiKeyNode>> {
		const nodeOrErr = await this.#nodeService.query([
			["secret", "==", secret],
			["mimetype", "==", Node.API_KEY_MIMETYPE],
		], 1);

		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}

		if (nodeOrErr.value.nodes.length === 0) {
			return left(new ApiKeyNodeFoundError(secret));
		}

		return this.get(nodeOrErr.value.nodes[0].uuid);
	}

	async list(): Promise<Either<AntboxError, ApiKeyNode[]>> {
		const usersOrErr = await this.#nodeService.list(Node.API_KEYS_FOLDER_UUID);

		if (usersOrErr.isLeft()) {
			return left(usersOrErr.value);
		}

		return right(usersOrErr.value.map((v) => (v as ApiKeyNode).cloneWithSecret()));
	}

	async delete(uuid: string): Promise<Either<AntboxError, void>> {
		const existingOrErr = await this.get(uuid);
		if (existingOrErr.isLeft()) {
			return left(existingOrErr.value);
		}

		return this.#nodeService.delete(uuid);
	}
}
