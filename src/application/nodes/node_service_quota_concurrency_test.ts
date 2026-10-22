import { describe, it } from "bdd";
import { expect } from "expect";
import { InMemoryConfigurationRepository } from "adapters/inmem/inmem_configuration_repository.ts";
import { InMemoryEventStoreRepository } from "adapters/inmem/inmem_event_store_repository.ts";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository.ts";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider.ts";
import { InMemoryEventBus } from "adapters/inmem/inmem_event_bus.ts";
import { TenantLimitsGuard } from "application/metrics/tenant_limits_guard.ts";
import type { AuthenticationContext } from "application/security/authentication_context.ts";
import { Groups } from "domain/users_groups/groups.ts";
import { Users } from "domain/users_groups/users.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { type StorageLimit } from "domain/metrics/tenant_limits.ts";
import { UnknownError } from "shared/antbox_error.ts";
import { left } from "shared/either.ts";
import { NodeService } from "./node_service.ts";

const auth: AuthenticationContext = {
	tenant: "quota-test",
	mode: "Direct",
	principal: { email: Users.ROOT_USER_EMAIL, groups: [Groups.ADMINS_GROUP_UUID] },
};

function file(size: number) {
	return new File(["x".repeat(size)], "quota.txt", { type: "text/plain" });
}

async function fixture(
	storage = new InMemoryStorageProvider(),
	storageLimit: StorageLimit = 0.0000001,
) {
	const repository = new InMemoryNodeRepository();
	const service = new NodeService({
		repository,
		configRepo: new InMemoryConfigurationRepository(),
		storage,
		bus: new InMemoryEventBus(),
		tenantLimitsGuard: new TenantLimitsGuard(repository, new InMemoryEventStoreRepository(), {
			storage: storageLimit,
			tokens: "pay-as-you-go",
		}),
	});
	const folder = await service.create(auth, {
		mimetype: Nodes.FOLDER_MIMETYPE,
		title: "Quota folder",
		parent: Nodes.ROOT_FOLDER_UUID,
	});
	if (folder.isLeft()) throw folder.value;
	return { service, repository, parent: folder.value.uuid! };
}

describe("NodeService concurrent storage quotas", () => {
	it("allows only one concurrent create when their combined size exceeds the quota", async () => {
		const { service, repository, parent } = await fixture();
		const results = await Promise.all([
			service.createFile(auth, file(60), { parent, uuid: "quota-one" }),
			service.createFile(auth, file(60), { parent, uuid: "quota-two" }),
		]);
		expect(results.filter((result) => result.isRight())).toHaveLength(1);
		expect((await repository.aggregateTotalSize()).right).toBe(60);
	});

	it("checks concurrent updates against the usage left by the preceding update", async () => {
		const { service, repository, parent } = await fixture();
		for (const uuid of ["quota-one", "quota-two"]) {
			const created = await service.createFile(auth, file(10), { parent, uuid });
			if (created.isLeft()) throw created.value;
		}
		const results = await Promise.all([
			service.updateFile(auth, "quota-one", file(70)),
			service.updateFile(auth, "quota-two", file(70)),
		]);
		expect(results.filter((result) => result.isRight())).toHaveLength(1);
		expect((await repository.aggregateTotalSize()).right).toBe(80);
	});

	it("shares the quota gate between creation and replacement", async () => {
		const { service, repository, parent } = await fixture();
		const created = await service.createFile(auth, file(10), { parent, uuid: "quota-one" });
		if (created.isLeft()) throw created.value;
		const results = await Promise.all([
			service.createFile(auth, file(60), { parent, uuid: "quota-two" }),
			service.updateFile(auth, "quota-one", file(60)),
		]);
		expect(results.filter((result) => result.isRight())).toHaveLength(1);
		expect((await repository.aggregateTotalSize()).right).toBeLessThan(105);
	});

	it("rereads the current file size inside the queue", async () => {
		const { service, repository, parent } = await fixture();
		for (const [uuid, size] of [["fixed-file", 50], ["updated-file", 20]] as const) {
			const created = await service.createFile(auth, file(size), { parent, uuid });
			if (created.isLeft()) throw created.value;
		}
		const results = await Promise.all([
			service.updateFile(auth, "updated-file", file(40)),
			service.updateFile(auth, "updated-file", file(50)),
		]);
		expect(results.every((result) => result.isRight())).toBe(true);
		expect((await repository.aggregateTotalSize()).right).toBe(100);
	});

	it("releases the queue and rolls back failed creation before checking the next quota", async () => {
		const storage = new InMemoryStorageProvider();
		const write = storage.write.bind(storage);
		let attempts = 0;
		storage.write = (...args) =>
			++attempts === 1
				? Promise.resolve(left(new UnknownError("Storage unavailable")))
				: write(...args);
		const { service, repository, parent } = await fixture(storage);
		const results = await Promise.all([
			service.createFile(auth, file(60), { parent, uuid: "failed-file" }),
			service.createFile(auth, file(60), { parent, uuid: "saved-file" }),
		]);
		expect(results[0].isLeft()).toBe(true);
		expect(results[1].isRight()).toBe(true);
		expect((await repository.aggregateTotalSize()).right).toBe(60);
	});

	it("keeps pay-as-you-go file writes concurrent", async () => {
		const storage = new InMemoryStorageProvider();
		const write = storage.write.bind(storage);
		const release = Promise.withResolvers<void>();
		const bothWrites = Promise.withResolvers<boolean>();
		let attempts = 0;
		storage.write = async (...args) => {
			if (++attempts === 2) bothWrites.resolve(true);
			await release.promise;
			return write(...args);
		};
		const { service, repository, parent } = await fixture(storage, "pay-as-you-go");
		const pending = Promise.all([
			service.createFile(auth, file(60), { parent, uuid: "quota-one" }),
			service.createFile(auth, file(60), { parent, uuid: "quota-two" }),
		]);
		const timeout = setTimeout(() => bothWrites.resolve(false), 1000);
		try {
			expect(await bothWrites.promise).toBe(true);
		} finally {
			clearTimeout(timeout);
			release.resolve();
			await pending;
		}
		expect((await repository.aggregateTotalSize()).right).toBe(120);
	});
});
