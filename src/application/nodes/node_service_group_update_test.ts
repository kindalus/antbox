import { describe, it } from "bdd";
import { expect } from "expect";
import { InMemoryConfigurationRepository } from "adapters/inmem/inmem_configuration_repository.ts";
import { InMemoryEventBus } from "adapters/inmem/inmem_event_bus.ts";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository.ts";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { NodeUpdatedEvent } from "domain/nodes/node_updated_event.ts";
import { Groups } from "domain/users_groups/groups.ts";
import { Users } from "domain/users_groups/users.ts";
import type { AuthenticationContext } from "application/security/authentication_context.ts";
import { NodeService } from "./node_service.ts";

const admin: AuthenticationContext = {
	tenant: "test",
	mode: "Direct",
	principal: { email: "admin@example.com", groups: [Groups.ADMINS_GROUP_UUID] },
};

async function harness() {
	const configRepo = new InMemoryConfigurationRepository();
	await configRepo.save("groups", {
		uuid: "new-group",
		title: "New group",
		createdTime: new Date().toISOString(),
	});
	const repository = new InMemoryNodeRepository();
	const bus = new InMemoryEventBus();
	const events: NodeUpdatedEvent[] = [];
	bus.subscribe(NodeUpdatedEvent.EVENT_ID, {
		handle: (event) => {
			events.push(event as NodeUpdatedEvent);
		},
	});
	const service = new NodeService({
		configRepo,
		repository,
		bus,
		storage: new InMemoryStorageProvider(),
	});
	const parent = await service.create(admin, {
		uuid: "parent",
		title: "Parent",
		parent: Nodes.ROOT_FOLDER_UUID,
		mimetype: Nodes.FOLDER_MIMETYPE,
		permissions: {
			group: ["Read", "Write"],
			authenticated: ["Read", "Write"],
			anonymous: [],
			advanced: {},
		},
	});
	expect(parent.isRight()).toBe(true);
	const folder = await service.create(admin, {
		uuid: "folder",
		title: "Folder",
		parent: "parent",
		mimetype: Nodes.FOLDER_MIMETYPE,
	});
	expect(folder.isRight()).toBe(true);
	await service.create(admin, {
		uuid: "child",
		title: "Child",
		parent: "folder",
		mimetype: Nodes.FOLDER_MIMETYPE,
	});
	await new Promise((resolve) => setTimeout(resolve, 30));
	events.length = 0;
	return { service, repository, events, original: folder.right };
}

describe("NodeService folder group updates", () => {
	for (
		const ctx of [admin, { ...admin, principal: { email: Users.ROOT_USER_EMAIL, groups: [] } }]
	) {
		it(`allows ${ctx.principal.email} to transfer a folder without changing descendants`, async () => {
			const { service, events, original } = await harness();
			const result = await service.update(ctx, "folder", { group: "new-group" });
			expect(result.isRight()).toBe(true);
			const updated = await service.get(admin, "folder");
			expect(updated.right.group).toBe("new-group");
			expect(updated.right.owner).toBe(original.owner);
			expect(updated.right.permissions).toEqual(original.permissions);
			const child = await service.get(admin, "child");
			expect(child.right.group).toBe(Groups.ADMINS_GROUP_UUID);
			await new Promise((resolve) => setTimeout(resolve, 30));
			const event = events.find((event) => event.payload.uuid === "folder");
			expect(event?.payload.oldValues).toEqual({ group: Groups.ADMINS_GROUP_UUID });
			expect(event?.payload.newValues).toEqual({ group: "new-group" });
		});
	}

	it("denies transfer by a writer but accepts the same group as a no-op", async () => {
		const { service, events } = await harness();
		const writer = { ...admin, principal: { email: "writer@example.com", groups: ["writers"] } };
		const denied = await service.update(writer, "folder", {
			group: "new-group",
			title: "Changed",
		});
		expect(denied.isLeft()).toBe(true);
		if (denied.isLeft()) expect(denied.value.errorCode).toBe("ForbiddenError");
		const unchanged = await service.get(admin, "folder");
		expect(unchanged.right.group).toBe(Groups.ADMINS_GROUP_UUID);
		expect(unchanged.right.title).toBe("Folder");
		expect(
			(await service.update(writer, "folder", { group: Groups.ADMINS_GROUP_UUID })).isRight(),
		).toBe(true);
		await new Promise((resolve) => setTimeout(resolve, 30));
		expect(events).toHaveLength(0);
	});

	it("allows a built-in target group", async () => {
		const { service } = await harness();
		expect(
			(await service.update(admin, "folder", { group: Groups.ANONYMOUS_GROUP_UUID })).isRight(),
		).toBe(true);
		expect((await service.get(admin, "folder")).right.group).toBe(Groups.ANONYMOUS_GROUP_UUID);
	});

	for (const restriction of ["lock", "workflow"]) {
		it(`keeps the existing ${restriction} restriction`, async () => {
			const { service, repository, events } = await harness();
			if (restriction === "lock") {
				const locker = {
					...admin,
					principal: { email: "locker@example.com", groups: ["lockers"] },
				};
				expect((await service.lock(locker, "folder", ["lockers"])).isRight()).toBe(true);
			} else {
				const node = await repository.getById("folder");
				node.right.update({ workflowInstanceUuid: "active-workflow" });
				await repository.update(node.right);
			}
			const result = await service.update(admin, "folder", { group: "new-group" });
			expect(result.isLeft()).toBe(true);
			expect((await service.get(admin, "folder")).right.group).toBe(Groups.ADMINS_GROUP_UUID);
			await new Promise((resolve) => setTimeout(resolve, 30));
			expect(events).toHaveLength(0);
		});
	}

	for (const group of ["", "missing-group"]) {
		it(`rejects invalid target ${JSON.stringify(group)} without mutation or event`, async () => {
			const { service, events } = await harness();
			const result = await service.update(admin, "folder", { group, title: "Changed" });
			expect(result.isLeft()).toBe(true);
			const node = await service.get(admin, "folder");
			expect(node.right.group).toBe(Groups.ADMINS_GROUP_UUID);
			expect(node.right.title).toBe("Folder");
			await new Promise((resolve) => setTimeout(resolve, 30));
			expect(events).toHaveLength(0);
		});
	}
});
