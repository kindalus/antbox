import { expect } from "expect/expect";
import { describe, it } from "bdd";
import { InMemoryEventBus } from "adapters/inmem/inmem_event_bus.ts";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository.ts";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider.ts";
import { ApiKeyNode } from "domain/api_keys/api_key_node.ts";
import { ApiKeyNodeFoundError } from "domain/api_keys/api_key_node_found_error.ts";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";
import { GroupNode } from "domain/users_groups/group_node.ts";
import { Groups } from "domain/users_groups/groups.ts";
import { ApiKeyService } from "application/api_key_service.ts";
import { AuthenticationContext } from "application/authentication_context.ts";
import { NodeService } from "application/node_service.ts";
import { Users } from "domain/users_groups/users.ts";
import { Left, Right } from "shared/either.ts";
import { builtinFolders } from "application/builtin_folders/index.ts";
import { builtinGroups } from "application/builtin_groups/index.ts";

const errToMsg = (err: unknown) => {
	const v = err instanceof Left || err instanceof Right ? err.value : err;
	if (v instanceof Error) {
		return v.message;
	}

	return JSON.stringify(v, null, 3);
};

const createService = (repository = new InMemoryNodeRepository()) => {
	const groupNode: GroupNode = GroupNode.create({
		uuid: "api-group",
		title: "API Group",
		owner: "owner@example.com",
	}).right;

	// Add builtin folders to repository
	builtinFolders.forEach((folder) => repository.add(folder));

	// Add builtin groups to repository
	builtinGroups.forEach((group) => repository.add(group));

	repository.add(groupNode);

	const storage = new InMemoryStorageProvider();
	const eventbus = new InMemoryEventBus();
	const nodeService = new NodeService({ repository, storage, bus: eventbus });

	return new ApiKeyService(nodeService);
};

const authContext: AuthenticationContext = {
	mode: "Direct",
	tenant: "default",
	principal: {
		email: "owner@example.com",
		groups: [Groups.ADMINS_GROUP_UUID],
	},
};

describe("ApiKeyService", () => {
	describe("create", () => {
		it("create should create an API key", async () => {
			const service = createService();

			const apiKeyOrErr = await service.create(authContext, "api-group");

			expect(apiKeyOrErr.isRight(), errToMsg(apiKeyOrErr.value)).toBeTruthy();
			expect(apiKeyOrErr.right.group).toBe("api-group");
		});

		it("create should return error if group does not exists", async () => {
			const service = createService();

			const apiKeyOrErr = await service.create(authContext, "non-existing-group");

			expect(apiKeyOrErr.isLeft()).toBeTruthy();
			expect(apiKeyOrErr.value).toBeInstanceOf(NodeNotFoundError);
		});
	});

	describe("get", () => {
		it("get should return the API key", async () => {
			const node = ApiKeyNode.create({
				title: "Test API Key",
				secret: "api-key-secret",
				group: "some-api-group",
				owner: Users.ROOT_USER_EMAIL,
			}).right;

			const repo = new InMemoryNodeRepository();
			repo.add(node);

			const service = createService(repo);

			const apiKeyOrErr = await service.get(node.uuid);

			expect(apiKeyOrErr.isRight(), errToMsg(apiKeyOrErr.value)).toBeTruthy();
			expect(apiKeyOrErr.right.group).toBe("some-api-group");
		});

		it("get should return error if node not found", async () => {
			const service = createService();

			const apiKeyOrErr = await service.get("--non-existing-uuid--");

			expect(apiKeyOrErr.isLeft(), errToMsg(apiKeyOrErr.value)).toBeTruthy();
			expect(apiKeyOrErr.value).toBeInstanceOf(NodeNotFoundError);
		});

		it("get should return error if node found is not API key node ", async () => {
			const service = createService();

			const apiKeyOrErr = await service.get("api-group");

			expect(apiKeyOrErr.isLeft(), errToMsg(apiKeyOrErr.value)).toBeTruthy();
			expect(apiKeyOrErr.value).toBeInstanceOf(ApiKeyNodeFoundError);
		});
	});

	describe("getBySecret", () => {
		it("getBySecret should return the API key", async () => {
			const repo = new InMemoryNodeRepository();
			repo.add(
				ApiKeyNode.create({
					uuid: "api-key-uuid",
					title: "Test API Key",
					secret: "api-key-secret",
					group: "api-group",
					owner: Users.ROOT_USER_EMAIL,
				}).right,
			);
			const service = createService(repo);

			const dto = await service.getBySecret("api-key-secret");

			expect(dto.isRight(), errToMsg(dto.value)).toBeTruthy();
			expect(dto.right.group).toBe("api-group");
		});

		it("getBySecret should return error if node not found", async () => {
			const service = createService();

			const apiKeyOrErr = await service.getBySecret("--any-secret--");

			expect(apiKeyOrErr.isLeft(), errToMsg(apiKeyOrErr.value)).toBeTruthy();
			expect(apiKeyOrErr.value).toBeInstanceOf(ApiKeyNodeFoundError);
		});
	});

	describe("list", () => {
		it("list should return all Api Keys", async () => {
			const service = createService();

			const apiGroupResult = await service.create(authContext, "api-group");
			expect(apiGroupResult.isRight(), errToMsg(apiGroupResult.value)).toBeTruthy();

			const adminsResult = await service.create(authContext, Groups.ADMINS_GROUP_UUID);
			expect(adminsResult.isRight(), errToMsg(adminsResult.value)).toBeTruthy();

			const apiKeys = await service.list(authContext);

			expect(apiKeys.length).toBe(2);

			expect(
				apiKeys.some((apiKey) => apiKey.group === "api-group"),
			)
				.toBeTruthy();
			expect(apiKeys.some((apiKey) => apiKey.group === Groups.ADMINS_GROUP_UUID))
				.toBeTruthy();
		});
	});

	describe("delete", () => {
		it("delete should remove the api key", async () => {
			const repo = new InMemoryNodeRepository();

			repo.add(
				ApiKeyNode.create({
					uuid: "api-key-uuid",
					title: "Test API Key",
					secret: "api-key-secret",
					group: "api-group",
					owner: Users.ROOT_USER_EMAIL,
				}).right,
			);

			const service = createService(repo);

			const voidOrErr = await service.delete(authContext, "api-key-uuid");

			expect(voidOrErr.isRight(), errToMsg(voidOrErr.value)).toBeTruthy();
			expect((await repo.getById("api-key-uuid")).isLeft()).toBeTruthy();
		});

		it("delete should return error if api key not exists", async () => {
			const service = createService();

			const voidOrErr = await service.delete(authContext, "--any-uuid--");

			expect(voidOrErr.isLeft(), errToMsg(voidOrErr.value)).toBeTruthy();
		});
	});
});

