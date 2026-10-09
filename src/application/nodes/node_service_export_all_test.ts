import { describe, it } from "bdd";
import { expect } from "expect";
import { strFromU8, unzipSync } from "fflate";
import { InMemoryConfigurationRepository } from "adapters/inmem/inmem_configuration_repository.ts";
import { InMemoryEventBus } from "adapters/inmem/inmem_event_bus.ts";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository.ts";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { Groups } from "domain/users_groups/groups.ts";
import { Users } from "domain/users_groups/users.ts";
import type { AuthenticationContext } from "application/security/authentication_context.ts";
import { NodeService } from "./node_service.ts";
import { NodeServiceProxy } from "./node_service_proxy.ts";
import { UnknownError } from "shared/antbox_error.ts";
import { left } from "shared/either.ts";

class TrackingStorage extends InMemoryStorageProvider {
	reads: string[] = [];
	failUuid?: string;
	beforeRead?: (uuid: string) => Promise<void>;
	override async read(uuid: string): ReturnType<InMemoryStorageProvider["read"]> {
		this.reads.push(uuid);
		await this.beforeRead?.(uuid);
		return uuid === this.failUuid
			? Promise.resolve(left(new UnknownError("Storage unavailable")))
			: super.read(uuid);
	}
}

const admin: AuthenticationContext = {
	mode: "Direct",
	tenant: "test",
	principal: { email: Users.ROOT_USER_EMAIL, groups: [Groups.ADMINS_GROUP_UUID] },
};

async function createService(storage = new TrackingStorage()) {
	const service = new NodeService({
		repository: new InMemoryNodeRepository(),
		storage,
		configRepo: new InMemoryConfigurationRepository(),
		bus: new InMemoryEventBus(),
	});
	expect((await service.create(admin, {
		uuid: "files",
		title: "Files",
		parent: Nodes.ROOT_FOLDER_UUID,
		mimetype: Nodes.FOLDER_MIMETYPE,
		permissions: {
			group: [],
			authenticated: [],
			anonymous: [],
			advanced: { readers: ["Read", "Export"] },
		},
	})).isRight()).toBe(true);
	return service;
}

async function addFile(
	service: NodeService,
	uuid: string,
	title: string,
	content: string,
	parent = "files",
) {
	const result = await service.createFile(
		admin,
		new File([content], title, { type: "text/plain" }),
		{
			uuid,
			title,
			mimetype: "text/plain",
			parent,
		},
	);
	expect(result.isRight(), result.isLeft() ? result.value.message : undefined).toBe(true);
}

describe("NodeService.exportAll", () => {
	it("downloads multiple files in one ZIP and leaves the originals intact", async () => {
		const service = await createService();
		await addFile(service, "file-a", "report.txt", "first file");
		await addFile(service, "file-b", "other.txt", "second file");

		const result = await service.exportAll(admin, ["file-a", "file-b"]);

		expect(result.isRight()).toBe(true);
		expect(result.right.type).toBe("application/zip");
		const zip = unzipSync(new Uint8Array(await result.right.arrayBuffer()));
		expect(Object.keys(zip)).toEqual(["report.txt", "other.txt"]);
		expect(strFromU8(zip["report.txt"])).toBe("first file");
		expect(strFromU8(zip["other.txt"])).toBe("second file");
		expect((await service.export(admin, "file-a")).right.size).toBe(10);
	});
	it("deduplicates IDs and FID aliases and resolves filename collisions", async () => {
		const storage = new TrackingStorage();
		const service = await createService(storage);
		await addFile(service, "file-a", "report.txt", "first");
		await addFile(service, "file-b", "report.txt", "second");
		const node = await service.get(admin, "file-a");
		storage.reads.length = 0;
		const result = await service.exportAll(admin, [
			"file-a",
			"file-a",
			Nodes.fidToUuid(node.right.fid),
			"file-b",
		]);
		expect(result.isRight()).toBe(true);
		const zip = unzipSync(new Uint8Array(await result.right.arrayBuffer()));
		expect(Object.keys(zip)).toEqual(["report.txt", "report (2).txt"]);
		expect(strFromU8(zip["report (2).txt"])).toBe("second");
		expect(storage.reads).toEqual(["file-a", "file-b"]);
	});

	for (const uuids of [[], [""], ["   "], Array.from({ length: 101 }, (_, i) => `file-${i}`)]) {
		it(`rejects invalid input of length ${uuids.length} before reading storage`, async () => {
			const storage = new TrackingStorage();
			const service = await createService(storage);
			const result = await service.exportAll(admin, uuids);
			expect(result.isLeft()).toBe(true);
			expect(storage.reads).toEqual([]);
		});
	}

	for (const uuid of ["files", "metadata-node", "smart-folder", "missing-node"]) {
		it(`rejects ${uuid} without a partial ZIP or storage reads`, async () => {
			const storage = new TrackingStorage();
			const service = await createService(storage);
			await addFile(service, "file-a", "a.txt", "a");
			await service.create(admin, {
				uuid: "metadata-node",
				title: "Metadata",
				parent: "files",
				mimetype: Nodes.META_NODE_MIMETYPE,
			});
			await service.create(admin, {
				uuid: "smart-folder",
				title: "Smart",
				parent: "files",
				mimetype: Nodes.SMART_FOLDER_MIMETYPE,
				filters: [["mimetype", "==", "text/plain"]],
			});
			storage.reads.length = 0;
			const result = await service.exportAll(admin, ["file-a", uuid]);
			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) {
				expect(result.value.errorCode).toBe(
					uuid === "missing-node" ? "NodeNotFoundError" : "BadRequestError",
				);
			}
			expect(storage.reads).toEqual([]);
		});
	}

	for (const permission of ["Read", "Export"] as const) {
		it(`requires ${permission} on every parent before any storage reads`, async () => {
			const storage = new TrackingStorage();
			const service = await createService(storage);
			await addFile(service, "allowed", "allowed.txt", "allowed");
			await service.create(admin, {
				uuid: "restricted",
				title: "Restricted",
				parent: Nodes.ROOT_FOLDER_UUID,
				mimetype: Nodes.FOLDER_MIMETYPE,
				group: "owners",
				permissions: {
					group: [],
					anonymous: [],
					authenticated: [],
					advanced: { readers: permission === "Read" ? ["Export"] : ["Read"] },
				},
			});
			await addFile(service, "denied", "denied.txt", "denied", "restricted");
			const reader = {
				...admin,
				principal: { email: "reader@example.com", groups: ["readers"] },
			};
			expect((await service.exportAll(reader, ["allowed"])).isRight()).toBe(true);
			storage.reads.length = 0;
			const result = await service.exportAll(reader, ["allowed", "denied"]);
			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) expect(result.value.errorCode).toBe("ForbiddenError");
			expect(storage.reads).toEqual([]);
		});
	}

	it("honors advanced Read and Export permissions through the bound proxy", async () => {
		const service = await createService();
		await service.create(admin, {
			uuid: "restricted",
			title: "Restricted",
			parent: Nodes.ROOT_FOLDER_UUID,
			mimetype: Nodes.FOLDER_MIMETYPE,
			group: "owners",
			permissions: {
				group: [],
				anonymous: [],
				authenticated: [],
				advanced: { readers: ["Read", "Export"] },
			},
		});
		await addFile(service, "file-a", "a.txt", "a", "restricted");
		const proxy = new NodeServiceProxy(service, undefined, {
			...admin,
			principal: { email: "reader@example.com", groups: ["readers"] },
		});
		const result = await proxy.exportAll(["file-a"]);
		expect(result.isRight()).toBe(true);
		const zip = unzipSync(new Uint8Array(await result.right.arrayBuffer()));
		expect(strFromU8(zip["a.txt"])).toBe("a");
	});

	it("rechecks permissions if access is revoked after preflight", async () => {
		const storage = new TrackingStorage();
		const service = await createService(storage);
		await addFile(service, "file-a", "a.txt", "a");
		await addFile(service, "file-b", "b.txt", "b");
		expect((await service.update(admin, "files", {
			permissions: {
				group: [],
				authenticated: [],
				anonymous: [],
				advanced: { readers: ["Read", "Export"] },
			},
		})).isRight()).toBe(true);
		storage.reads.length = 0;
		storage.beforeRead = async (uuid) => {
			if (uuid !== "file-a") return;
			expect((await service.update(admin, "files", {
				permissions: {
					group: [],
					authenticated: [],
					anonymous: [],
					advanced: { readers: ["Read"] },
				},
			})).isRight()).toBe(true);
		};
		const reader = { ...admin, principal: { email: "reader@example.com", groups: ["readers"] } };
		const result = await service.exportAll(reader, ["file-a", "file-b"]);
		expect(result.isLeft()).toBe(true);
		if (result.isLeft()) expect(result.value.errorCode).toBe("ForbiddenError");
		expect(storage.reads).toEqual(["file-a"]);
	});

	it("fails the whole batch when storage fails", async () => {
		const storage = new TrackingStorage();
		const service = await createService(storage);
		await addFile(service, "file-a", "a.txt", "a");
		await addFile(service, "file-b", "b.txt", "b");
		storage.failUuid = "file-b";
		const result = await service.exportAll(admin, ["file-a", "file-b"]);
		expect(result.isLeft()).toBe(true);
		if (result.isLeft()) expect(result.value.errorCode).toBe("UnknownError");
		expect(Object.keys(storage.fs)).toEqual(["file-a", "file-b"]);
	});
});
