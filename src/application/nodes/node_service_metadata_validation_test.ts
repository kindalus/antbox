import { describe, it } from "bdd";
import { expect } from "expect";
import { InMemoryConfigurationRepository } from "adapters/inmem/inmem_configuration_repository.ts";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository.ts";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider.ts";
import type { NodeMetadata } from "domain/nodes/node_metadata.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { Groups } from "domain/users_groups/groups.ts";
import { Users } from "domain/users_groups/users.ts";
import { ValidationError } from "shared/validation_error.ts";
import type { AuthenticationContext } from "application/security/authentication_context.ts";
import { NodeService } from "./node_service.ts";

const ctx: AuthenticationContext = {
	tenant: "test",
	mode: "Direct",
	principal: { email: Users.ROOT_USER_EMAIL, groups: [Groups.ADMINS_GROUP_UUID] },
};

class RecordingStorage extends InMemoryStorageProvider {
	writes = 0;
	override write(uuid: string, file: File) {
		this.writes++;
		return super.write(uuid, file);
	}
}

async function harness() {
	const repository = new InMemoryNodeRepository();
	const storage = new RecordingStorage();
	const service = new NodeService({
		repository,
		storage,
		configRepo: new InMemoryConfigurationRepository(),
		bus: { publish() {}, subscribe() {}, unsubscribe() {} },
	});
	const parent = await service.create(ctx, {
		uuid: "parent-folder",
		title: "Parent folder",
		parent: Nodes.ROOT_FOLDER_UUID,
		mimetype: Nodes.FOLDER_MIMETYPE,
	});
	if (parent.isLeft()) throw parent.value;
	return { service, repository, storage };
}

const malformedMetadata = [
	{ title: 42 },
	{ description: { toString: null, valueOf: null } },
	{ description: [] },
	{ fid: {} },
	{ tags: { length: 1 } },
	{ tags: "one tag" },
	{ tags: [123] },
	{ aspects: {} },
	{ aspects: "aspect" },
	{ aspects: [false] },
	{ related: {} },
	{ related: "related-node" },
	{ related: [123] },
	{ properties: [] },
	{ properties: "properties" },
	{ properties: 42 },
] as unknown as Partial<NodeMetadata>[];

describe("NodeService metadata input shapes", () => {
	for (const operation of ["create", "createFile"] as const) {
		it(`rejects malformed ${operation} metadata without persisting nodes or files`, async () => {
			const { service, repository, storage } = await harness();
			for (const malformed of malformedMetadata) {
				const metadata = {
					uuid: "invalid-node",
					title: "New file",
					parent: "parent-folder",
					mimetype: "text/plain",
					...malformed,
				};
				const result = operation === "create"
					? await service.create(ctx, metadata)
					: await service.createFile(
						ctx,
						new File(["new bytes"], "new.txt", { type: "text/plain" }),
						metadata,
					);
				expect(result.value, JSON.stringify(malformed)).toBeInstanceOf(ValidationError);
				expect(repository.count).toBe(1);
				expect(storage.writes).toBe(0);
			}
		});
	}

	it("rejects malformed updates without changing stored metadata or file bytes", async () => {
		const { service, storage } = await harness();
		const created = await service.createFile(
			ctx,
			new File(["original bytes"], "original.txt", { type: "text/plain" }),
			{ parent: "parent-folder", description: "Original", tags: ["original"] },
		);
		if (created.isLeft()) throw created.value;
		const snapshot = structuredClone((await service.get(ctx, created.value.uuid)).right);
		for (const malformed of malformedMetadata) {
			const result = await service.update(ctx, created.value.uuid, malformed);
			expect(result.value, JSON.stringify(malformed)).toBeInstanceOf(ValidationError);
			expect((await service.get(ctx, created.value.uuid)).right).toEqual(snapshot);
			expect(await (await storage.read(created.value.uuid)).right.text()).toBe("original bytes");
			expect(storage.writes).toBe(1);
		}
	});

	it("preserves nullish defaults, empty collections, and automatic friendly identifiers", async () => {
		const { service } = await harness();
		const created = await service.createFile(
			ctx,
			new File(["content"], "original.txt", { type: "text/plain" }),
			{
				parent: "parent-folder",
				fid: "",
				description: null,
				tags: null,
				aspects: null,
				related: null,
				properties: null,
			} as unknown as Partial<NodeMetadata>,
		);
		if (created.isLeft()) throw created.value;
		expect(created.value.fid).toBe("original-txt");
		expect(created.value.tags).toEqual([]);
		expect(created.value.aspects).toEqual([]);
		expect(created.value.related).toEqual([]);
		expect(created.value.properties).toEqual({});

		expect((await service.update(ctx, created.value.uuid, {
			description: "Keep description",
			tags: ["keep"],
			related: ["related-node"],
		})).isRight()).toBe(true);
		expect((await service.update(ctx, created.value.uuid, {
			title: "Renamed file",
			fid: "",
			parent: null,
			description: null,
			tags: null,
			aspects: null,
			related: null,
			properties: null,
		} as unknown as Partial<NodeMetadata>)).isRight()).toBe(true);
		const updated = (await service.get(ctx, created.value.uuid)).right;
		expect(updated.fid).toBe("renamed-file");
		expect(updated.parent).toBe("parent-folder");
		expect(updated.description).toBe("Keep description");
		expect(updated.tags).toEqual(["keep"]);
		expect(updated.related).toEqual(["related-node"]);
		expect((await service.update(ctx, created.value.uuid, {
			description: "",
			tags: [],
			aspects: [],
			related: [],
			properties: {},
		})).isRight()).toBe(true);
		const cleared = (await service.get(ctx, created.value.uuid)).right;
		expect(cleared.description).toBe("");
		expect(cleared.tags).toEqual([]);
		expect(cleared.related).toEqual([]);
	});
});
