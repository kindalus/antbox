import { describe, it } from "bdd";
import { expect } from "expect";
import { InMemoryConfigurationRepository } from "adapters/inmem/inmem_configuration_repository.ts";
import { InMemoryEventBus } from "adapters/inmem/inmem_event_bus.ts";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository.ts";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider.ts";
import { NodeCreatedEvent } from "domain/nodes/node_created_event.ts";
import { NodeDeletedEvent } from "domain/nodes/node_deleted_event.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { Groups } from "domain/users_groups/groups.ts";
import { Users } from "domain/users_groups/users.ts";
import { BadRequestError, UnknownError } from "shared/antbox_error.ts";
import { left } from "shared/either.ts";
import type { AuthenticationContext } from "../security/authentication_context.ts";
import { NodeService } from "./node_service.ts";

const adminCtx: AuthenticationContext = {
	mode: "Direct",
	tenant: "test",
	principal: {
		email: Users.ROOT_USER_EMAIL,
		groups: [Groups.ADMINS_GROUP_UUID],
	},
};

const workflowCtx: AuthenticationContext = {
	...adminCtx,
	principal: {
		email: Users.WORKFLOW_INSTANCE_USER_EMAIL,
		groups: [Groups.ADMINS_GROUP_UUID],
	},
};

function createHarness(storage: InMemoryStorageProvider = new InMemoryStorageProvider()) {
	const repository = new InMemoryNodeRepository();
	const bus = new InMemoryEventBus();
	const service = new NodeService({
		repository,
		storage,
		bus,
		configRepo: new InMemoryConfigurationRepository(),
	});
	return { bus, service };
}

async function createParent(service: NodeService) {
	return await service.create(adminCtx, {
		uuid: "parent",
		title: "Parent",
		parent: Nodes.ROOT_FOLDER_UUID,
		mimetype: Nodes.FOLDER_MIMETYPE,
		filters: [],
	});
}

const flushEvents = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("NodeService consistency", () => {
	it("rolls back metadata and does not publish an event when file storage fails", async () => {
		const { bus, service } = createHarness(new FailingWriteStorage());
		await createParent(service);
		const createdEvents: NodeCreatedEvent[] = [];
		bus.subscribe(NodeCreatedEvent.EVENT_ID, {
			handle: (event) => createdEvents.push(event as NodeCreatedEvent),
		});
		await flushEvents();

		const result = await service.createFile(
			adminCtx,
			new File(["content"], "failed.txt", { type: "text/plain" }),
			{ uuid: "failed-file", parent: "parent" },
		);
		await flushEvents();

		expect(result.isLeft()).toBe(true);
		expect(result.value).toBeInstanceOf(UnknownError);
		expect((await service.get(adminCtx, "failed-file")).isLeft()).toBe(true);
		expect(createdEvents.map((event) => event.payload.uuid)).not.toContain("failed-file");
	});

	it("persists the CDN URL supplied by storage", async () => {
		const { service } = createHarness(new CdnStorage());
		await createParent(service);

		const result = await service.createFile(
			adminCtx,
			new File(["content"], "cdn.txt", { type: "text/plain" }),
			{ uuid: "cdn-file", parent: "parent" },
		);

		expect(result.isRight()).toBe(true);
		const persisted = await service.get(adminCtx, "cdn-file");
		expect(persisted.isRight()).toBe(true);
		expect(persisted.right.cdnUrl).toBe("https://cdn.example/cdn-file");
	});

	it("keeps metadata and suppresses delete events when storage deletion fails", async () => {
		const storage = new FailingDeleteStorage();
		const { bus, service } = createHarness(storage);
		await createParent(service);
		await service.createFile(
			adminCtx,
			new File(["content"], "kept.txt", { type: "text/plain" }),
			{ uuid: "kept-file", parent: "parent" },
		);
		const deletedEvents: NodeDeletedEvent[] = [];
		bus.subscribe(NodeDeletedEvent.EVENT_ID, {
			handle: (event) => deletedEvents.push(event as NodeDeletedEvent),
		});
		await flushEvents();
		storage.failUuid = "kept-file";

		const result = await service.delete(adminCtx, "kept-file");
		await flushEvents();

		expect(result.isLeft()).toBe(true);
		expect(result.value).toBeInstanceOf(UnknownError);
		expect((await service.get(adminCtx, "kept-file")).isRight()).toBe(true);
		expect(deletedEvents).toHaveLength(0);
	});

	it("does not accept workflow fields from an ordinary create", async () => {
		const { service } = createHarness();
		await createParent(service);

		const result = await service.create(adminCtx, {
			uuid: "ordinary-node",
			title: "Ordinary node",
			parent: "parent",
			mimetype: Nodes.META_NODE_MIMETYPE,
			workflowInstanceUuid: "forged-instance",
			workflowState: "forged-state",
		});

		expect(result.isRight()).toBe(true);
		expect(result.right.workflowInstanceUuid).toBeUndefined();
		expect(result.right.workflowState).toBeUndefined();
	});

	it("does not accept workflow fields from an ordinary update", async () => {
		const { service } = createHarness();
		await createParent(service);
		await service.create(adminCtx, {
			uuid: "ordinary-node",
			title: "Ordinary node",
			parent: "parent",
			mimetype: Nodes.META_NODE_MIMETYPE,
		});

		const result = await service.update(adminCtx, "ordinary-node", {
			workflowInstanceUuid: "forged-instance",
			workflowState: "forged-state",
		});

		expect(result.isRight()).toBe(true);
		const persisted = await service.get(adminCtx, "ordinary-node");
		expect(persisted.right.workflowInstanceUuid).toBeUndefined();
		expect(persisted.right.workflowState).toBeUndefined();
	});

	it("prevents ordinary updates and deletion while a workflow owns the node", async () => {
		const { service } = createHarness();
		await createParent(service);
		await service.create(adminCtx, {
			uuid: "workflow-node",
			title: "Workflow node",
			parent: "parent",
			mimetype: Nodes.META_NODE_MIMETYPE,
		});
		const workflowUpdate = await service.update(workflowCtx, "workflow-node", {
			workflowInstanceUuid: "workflow-instance",
			workflowState: "review",
		});
		expect(workflowUpdate.isRight()).toBe(true);

		const updateResult = await service.update(adminCtx, "workflow-node", {
			title: "Forged update",
		});
		const deleteResult = await service.delete(adminCtx, "workflow-node");

		expect(updateResult.isLeft()).toBe(true);
		expect(updateResult.value).toBeInstanceOf(BadRequestError);
		expect(deleteResult.isLeft()).toBe(true);
		expect(deleteResult.value).toBeInstanceOf(BadRequestError);
		expect((await service.get(adminCtx, "workflow-node")).right.title).toBe("Workflow node");
	});
});

class FailingWriteStorage extends InMemoryStorageProvider {
	override write(): ReturnType<InMemoryStorageProvider["write"]> {
		return Promise.resolve(left(new UnknownError("Storage write failed")));
	}
}

class CdnStorage extends InMemoryStorageProvider {
	override provideCDN(): boolean {
		return true;
	}

	override getCDNUrl(uuid: string): string {
		return `https://cdn.example/${uuid}`;
	}
}

class FailingDeleteStorage extends InMemoryStorageProvider {
	failUuid?: string;

	override delete(uuid: string): ReturnType<InMemoryStorageProvider["delete"]> {
		if (uuid === this.failUuid) {
			return Promise.resolve(left(new UnknownError("Storage delete failed")));
		}
		return super.delete(uuid);
	}
}
