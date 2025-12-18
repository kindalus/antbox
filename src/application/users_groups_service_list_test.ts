import { describe, it } from "bdd";
import { expect } from "expect";
import { UsersGroupsService } from "./users_groups_service.ts";
import { NodeService } from "./node_service.ts";
import type { NodeServiceContext } from "./node_service_context.ts";
import { InMemoryEventBus } from "adapters/inmem/inmem_event_bus.ts";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository.ts";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider.ts";
import { builtinGroups } from "application/builtin_groups/index.ts";
import { Users } from "domain/users_groups/users.ts";
import { Groups } from "domain/users_groups/groups.ts";
import type { AuthenticationContext } from "./authentication_context.ts";

describe("UsersGroupsService", () => {
	describe("listUsers", () => {
		it("should list the users", async () => {
			const service = usersGroupsService();

			const usersOrErr = await service.listUsers(authCtx);

			expect(usersOrErr.isRight()).toBeTruthy();
			expect(usersOrErr.right.length).toBe(2);
		});
	});

	describe("listGroups", () => {
		it("should list built-in groups", async () => {
			const service = usersGroupsService();

			const groupsOrErr = await service.listGroups(authCtx);

			expect(groupsOrErr.isRight()).toBeTruthy();
			expect(groupsOrErr.right.length).toBe(builtinGroups.length);
		});
	});
});

const authCtx: AuthenticationContext = {
	mode: "Direct",
	tenant: "default",
	principal: {
		email: Users.ROOT_USER_EMAIL,
		groups: [Groups.ADMINS_GROUP_UUID],
	},
};

const usersGroupsService = (opts: Partial<NodeServiceContext> = {}) => {
	const nodeService = new NodeService({
		storage: opts.storage ?? new InMemoryStorageProvider(),
		repository: opts.repository ?? new InMemoryNodeRepository(),
		bus: opts.bus ?? new InMemoryEventBus(),
	});

	return new UsersGroupsService(nodeService);
};
