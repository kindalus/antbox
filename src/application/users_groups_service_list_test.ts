import { describe, test, expect } from "bun:test";
import type { UsersGroupsContext } from "./users_groups_service_context";
import { UsersGroupsService } from "./users_groups_service";
import { InMemoryEventBus } from "adapters/inmem/inmem_event_bus";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider";

describe("UsersGroupsService.listUsers", () => {
    test("should list the users", async () => {
        const service = usersGroupsService();

        const usersOrErr = await service.listUsers();

        expect(usersOrErr.isRight()).toBeTruthy();
        expect(usersOrErr.right.length).toBe(2);
    });
});

describe("UsersGroupsService.listGroups", () => {
    test("should list the groups", async () => {
        const service =  usersGroupsService();

        const groups = await service.listGroups();

        expect(groups.length).toBe(1);
    });
});

const usersGroupsService = (opts: Partial<UsersGroupsContext> = {}) => new UsersGroupsService({
    storage: opts.storage ?? new InMemoryStorageProvider(),
    repository: opts.repository ?? new InMemoryNodeRepository(),
    bus: opts.bus ?? new InMemoryEventBus(),
});
