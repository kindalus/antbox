import { describe, it } from "bdd";
import { expect } from "expect";
import { InMemoryConfigurationRepository } from "adapters/inmem/inmem_configuration_repository.ts";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository.ts";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider.ts";
import type { NodeLike } from "domain/node_like.ts";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";
import { left } from "shared/either.ts";
import type { NodeMetadata } from "domain/nodes/node_metadata.ts";
import type { Permission } from "domain/nodes/node.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { Groups } from "domain/users_groups/groups.ts";
import { Users } from "domain/users_groups/users.ts";
import { BadRequestError, ForbiddenError } from "shared/antbox_error.ts";
import type { AuthenticationContext } from "../security/authentication_context.ts";
import { NodeService } from "./node_service.ts";
import { NodeServiceProxy } from "./node_service_proxy.ts";

const root: AuthenticationContext = {
	mode: "Direct",
	tenant: "test",
	principal: { email: Users.ROOT_USER_EMAIL, groups: [Groups.ADMINS_GROUP_UUID] },
};
const user: AuthenticationContext = {
	...root,
	principal: { email: "user@example.com", groups: ["users", "editors"] },
};

function setup(repository = new InMemoryNodeRepository()) {
	const storage = new InMemoryStorageProvider();
	const service = new NodeService({
		repository,
		storage,
		configRepo: new InMemoryConfigurationRepository(),
		bus: { publish() {}, subscribe() {}, unsubscribe() {} },
	});
	return { service, repository, storage };
}

async function folder(
	service: NodeService,
	uuid: string,
	authenticated: Permission[] = [],
	metadata: Partial<NodeMetadata> = {},
) {
	const created = await service.create(root, {
		uuid,
		title: uuid,
		parent: Nodes.ROOT_FOLDER_UUID,
		mimetype: Nodes.FOLDER_MIMETYPE,
		permissions: { authenticated, anonymous: [], group: [], advanced: {} },
		...metadata,
	});
	expect(created.isRight()).toBe(true);
	return created.right;
}

async function file(service: NodeService, parent: string) {
	const created = await service.createFile(
		root,
		new File(["original"], "content.txt", { type: "text/plain" }),
		{ uuid: "content", fid: "friendly-content", parent },
	);
	expect(created.isRight()).toBe(true);
	return created.right;
}

describe("NodeService authorization and validation before side effects", () => {
	it("denies a parent writer changing a restricted child folder's permissions", async () => {
		const { service } = setup();
		await folder(service, "shared-folder", ["Read", "Write"]);
		await folder(service, "restricted-folder", [], { parent: "shared-folder" });
		await file(service, "restricted-folder");
		expect((await service.get(user, "restricted-folder")).value).toBeInstanceOf(ForbiddenError);
		expect((await service.export(user, "content")).value).toBeInstanceOf(ForbiddenError);

		const update = await service.update(user, "restricted-folder", {
			permissions: {
				authenticated: ["Read", "Write", "Export"],
				anonymous: [],
				group: [],
				advanced: {},
			},
		});
		expect(update.value).toBeInstanceOf(ForbiddenError);
		expect((await service.get(root, "restricted-folder")).right.permissions!.authenticated)
			.toEqual([]);
		expect((await service.export(user, "content")).value).toBeInstanceOf(ForbiddenError);
	});

	it("allows folder ACL updates for writers on both folders and administrators", async () => {
		const { service } = setup();
		await folder(service, "shared-folder", ["Read", "Write"]);
		await folder(service, "writable-folder", ["Read", "Write"], { parent: "shared-folder" });
		await folder(service, "restricted-folder", [], { parent: "shared-folder" });
		const permissions = {
			authenticated: ["Read", "Export"] as Permission[],
			anonymous: [],
			group: [],
			advanced: {},
		};
		expect((await service.update(user, "writable-folder", { permissions })).isRight()).toBe(true);
		expect((await service.update(root, "restricted-folder", { permissions })).isRight()).toBe(
			true,
		);
		expect((await service.get(user, "writable-folder")).right.permissions).toEqual({
			...permissions,
			advanced: {},
		});
	});

	it("does not let a read-only feature mutate stored metadata or grant itself Write", async () => {
		const { service } = setup();
		await folder(service, "read-only-folder", ["Read"]);
		await file(service, "read-only-folder");
		const proxy = new NodeServiceProxy(service, undefined, user);
		const metadata = (await proxy.get("content")).right;
		metadata.tags!.push("unsaved");
		expect((await proxy.update("content", { tags: metadata.tags })).value).toBeInstanceOf(
			ForbiddenError,
		);
		expect((await service.get(root, "content")).right.tags).toEqual([]);

		const parent = (await proxy.get("read-only-folder")).right;
		parent.permissions!.authenticated.push("Write");
		expect((await proxy.update("content", { description: "unauthorized" })).value)
			.toBeInstanceOf(ForbiddenError);
		expect((await service.get(root, "read-only-folder")).right.permissions!.authenticated)
			.toEqual(["Read"]);
	});

	it("requires workflow completion or cancellation to unlock even for an administrator", async () => {
		const { service } = setup();
		await folder(service, "source-folder", ["Read", "Write"]);
		await file(service, "source-folder");
		expect((await service.lock(user, "content", [Groups.ADMINS_GROUP_UUID])).isRight()).toBe(
			true,
		);
		const workflow = {
			...root,
			principal: { ...root.principal, email: Users.WORKFLOW_INSTANCE_USER_EMAIL },
		};
		expect((await service.update(workflow, "content", {
			workflowInstanceUuid: "active-workflow",
		})).isRight()).toBe(true);

		for (const ctx of [user, root]) {
			const result = await service.unlock(ctx, "content");
			expect(result.value).toBeInstanceOf(BadRequestError);
			expect((await service.get(root, "content")).right.locked).toBe(true);
		}
		expect((await service.unlock(workflow, "content")).isRight()).toBe(true);
	});

	for (const reason of ["permission", "lock", "workflow", "filter"] as const) {
		it(`preserves file bytes when replacement fails ${reason} checks`, async () => {
			const { service, storage } = setup();
			await folder(
				service,
				"source-folder",
				reason === "permission" ? ["Read"] : ["Read", "Write"],
				{
					filters: reason === "filter" ? [["size", "<=", 8]] : [],
				},
			);
			await file(service, "source-folder");
			if (reason === "lock") await service.lock(root, "content");
			if (reason === "workflow") {
				await service.update(
					{
						...root,
						principal: { ...root.principal, email: Users.WORKFLOW_INSTANCE_USER_EMAIL },
					},
					"content",
					{ workflowInstanceUuid: "active-workflow" },
				);
			}

			const result = await service.updateFile(
				user,
				"content",
				new File(["unauthorized replacement"], "content.txt", { type: "text/plain" }),
			);

			expect(result.isLeft()).toBe(true);
			expect(await (await storage.read("content")).right.text()).toBe("original");
			expect((await service.get(root, "content")).right.size).toBe(8);
		});
	}

	it("replaces the canonical file when addressed by a friendly identifier", async () => {
		const { service, storage } = setup();
		await folder(service, "source-folder", ["Read", "Write"]);
		await file(service, "source-folder");

		const result = await service.updateFile(
			user,
			Nodes.fidToUuid("friendly-content"),
			new File(["changed"], "content.txt", { type: "text/plain" }),
		);

		expect(result.isRight()).toBe(true);
		expect(await (await storage.read("content")).right.text()).toBe("changed");
		expect((await service.get(root, "content")).right.size).toBe(7);
	});

	for (const permissions of [[], ["Read"], ["Write"]] as Permission[][]) {
		it(`rejects file copy and duplication without both Read and Export (${permissions.join(",")})`, async () => {
			const { service, repository } = setup();
			await folder(service, "source-folder", permissions);
			await folder(service, "target-folder", ["Read", "Write", "Export"]);
			await file(service, "source-folder");
			const count = repository.count;

			expect((await service.copy(user, "content", "target-folder")).isLeft()).toBe(true);
			expect((await service.duplicate(user, "content")).isLeft()).toBe(true);
			expect(repository.count).toBe(count);
		});
	}

	it("copies file content when source Read and Export and destination Write are allowed", async () => {
		const { service, storage } = setup();
		await folder(service, "source-folder", ["Read", "Export"]);
		await folder(service, "target-folder", ["Read", "Write"]);
		await file(service, "source-folder");

		const result = await service.copy(user, "content", "target-folder");

		expect(result.isRight()).toBe(true);
		expect(await (await storage.read(result.right.uuid)).right.text()).toBe("original");
	});

	it("rejects a move into a folder without Write and preserves the source", async () => {
		const { service } = setup();
		await folder(service, "source-folder", ["Read", "Write"]);
		await folder(service, "target-folder", ["Read"]);
		await file(service, "source-folder");

		const result = await service.update(user, "content", { parent: "target-folder" });

		expect(result.value).toBeInstanceOf(ForbiddenError);
		expect((await service.get(root, "content")).right.parent).toBe("source-folder");
	});

	for (const parent of ["source-folder", "nested-folder"]) {
		it(`rejects folder cycles through ${parent}`, async () => {
			const { service } = setup();
			await folder(service, "source-folder");
			await folder(service, "nested-folder", [], { parent: "source-folder" });

			const result = await service.update(root, "source-folder", { parent });

			expect(result.value).toBeInstanceOf(BadRequestError);
			expect((await service.get(root, "source-folder")).right.parent).toBe(
				Nodes.ROOT_FOLDER_UUID,
			);
		});
	}

	it("preserves a locked file when a different writer tries to delete it", async () => {
		const { service, storage } = setup();
		await folder(service, "source-folder", ["Read", "Write"]);
		await file(service, "source-folder");
		await service.lock(root, "content");

		const result = await service.delete(user, "content");

		expect(result.value).toBeInstanceOf(BadRequestError);
		expect((await service.get(root, "content")).isRight()).toBe(true);
		expect(await (await storage.read("content")).right.text()).toBe("original");
	});

	it("deletes files and descendant metadata through a folder friendly identifier", async () => {
		const { service, repository, storage } = setup();
		await folder(service, "source-folder", [], { fid: "friendly-folder" });
		await file(service, "source-folder");

		const result = await service.delete(root, Nodes.fidToUuid("friendly-folder"));

		expect(result.isRight()).toBe(true);
		expect(repository.count).toBe(0);
		expect((await storage.read("content")).isLeft()).toBe(true);
	});

	it("stores canonical parent UUIDs when creating and moving through friendly identifiers", async () => {
		const { service } = setup();
		await folder(service, "source-folder", [], { fid: "friendly-source" });
		await folder(service, "target-folder", [], { fid: "friendly-target" });
		const created = await file(service, Nodes.fidToUuid("friendly-source"));

		expect(created.parent).toBe("source-folder");
		expect((await service.list(root, "source-folder")).right).toHaveLength(1);
		const moved = await service.update(root, "content", {
			parent: Nodes.fidToUuid("friendly-target"),
		});
		expect(moved.isRight()).toBe(true);
		expect((await service.get(root, "content")).right.parent).toBe("target-folder");
		expect((await service.list(root, "target-folder")).right).toHaveLength(1);
	});

	it("locks and unlocks every descendant through a folder friendly identifier", async () => {
		const { service } = setup();
		await folder(service, "source-folder", [], { fid: "friendly-folder" });
		await file(service, "source-folder");

		expect((await service.lock(root, Nodes.fidToUuid("friendly-folder"))).isRight()).toBe(true);
		expect((await service.get(root, "content")).right.locked).toBe(true);
		expect((await service.unlock(root, Nodes.fidToUuid("friendly-folder"))).isRight()).toBe(true);
		expect((await service.get(root, "content")).right.locked).toBe(false);
	});

	it("keeps measured file size when metadata clients attempt to change it", async () => {
		const { service, repository } = setup();
		await folder(service, "source-folder", ["Read", "Write"]);
		await file(service, "source-folder");

		const result = await service.update(user, "content", { size: 0, title: "Updated title" });

		expect(result.isRight()).toBe(true);
		expect((await service.get(root, "content")).right.size).toBe(8);
		expect((await repository.aggregateTotalSize()).right).toBe(8);
	});

	it("starts metadata-only file records at zero bytes", async () => {
		const { service, repository } = setup();
		await folder(service, "source-folder", ["Read", "Write"]);
		const result = await service.create(user, {
			uuid: "metadata-file",
			title: "Metadata file",
			mimetype: "text/plain",
			parent: "source-folder",
			size: -1000,
		});
		expect(result.isRight()).toBe(true);
		expect(result.right.size).toBe(0);
		expect((await repository.aggregateTotalSize()).right).toBe(0);
	});

	it("reports descendant lock failures without mutating failed repository records", async () => {
		const repository = new FailingUpdateRepository();
		const { service } = setup(repository);
		await folder(service, "source-folder");
		await file(service, "source-folder");
		repository.failUuid = "content";

		const result = await service.lock(root, "source-folder");

		expect(result.value).toBeInstanceOf(NodeNotFoundError);
		expect((await service.get(root, "content")).right.locked).toBe(false);
	});

	it("reports descendant unlock failures without mutating failed repository records", async () => {
		const repository = new FailingUpdateRepository();
		const { service } = setup(repository);
		await folder(service, "source-folder");
		await file(service, "source-folder");
		await service.lock(root, "source-folder");
		repository.failUuid = "content";

		const result = await service.unlock(root, "source-folder");

		expect(result.value).toBeInstanceOf(NodeNotFoundError);
		expect((await service.get(root, "content")).right.locked).toBe(true);
		expect((await service.get(root, "source-folder")).right.locked).toBe(true);
		repository.failUuid = undefined;
		expect((await service.unlock(root, "source-folder")).isRight()).toBe(true);
		expect((await service.get(root, "content")).right.locked).toBe(false);
		expect((await service.get(root, "source-folder")).right.locked).toBe(false);
	});

	it("rejects reserved node types in file uploads before persistence", async () => {
		const { service, repository, storage } = setup();
		await folder(service, "source-folder", ["Read", "Write"]);
		for (const mimetype of [Nodes.FOLDER_MIMETYPE, Nodes.META_NODE_MIMETYPE]) {
			const result = await service.createFile(
				user,
				new File(["bytes"], "upload", { type: mimetype }),
				{
					uuid: "invalid-upload",
					parent: "source-folder",
				},
			);
			expect(result.value).toBeInstanceOf(BadRequestError);
			expect(repository.count).toBe(1);
			expect((await storage.read("invalid-upload")).isLeft()).toBe(true);
		}
	});

	it("accepts JavaScript MIME aliases without accepting unrelated replacement types", async () => {
		for (
			const [original, replacement, allowed] of [
				["text/plain", "application/javascript", false],
				["application/javascript", "text/plain", false],
				["application/javascript", "text/javascript", true],
				["text/javascript", "application/javascript", true],
			] as const
		) {
			const { service, storage } = setup();
			await folder(service, "source-folder", ["Read", "Write"]);
			await service.createFile(root, new File(["original"], "content", { type: original }), {
				uuid: "content",
				parent: "source-folder",
			});
			const result = await service.updateFile(
				user,
				"content",
				new File(["replacement"], "content", {
					type: replacement,
				}),
			);
			expect(result.isRight()).toBe(allowed);
			expect(await (await storage.read("content")).right.text()).toBe(
				allowed ? "replacement" : "original",
			);
		}
	});

	it("validates every existing child when folder filters change", async () => {
		const { service } = setup();
		await folder(service, "source-folder");
		for (let i = 0; i < 21; i++) {
			await service.create(root, {
				uuid: `child-${i}`,
				title: i === 20 ? "Z invalid child" : `A valid child ${i}`,
				parent: "source-folder",
				mimetype: Nodes.META_NODE_MIMETYPE,
			});
		}

		const result = await service.update(root, "source-folder", {
			filters: [["title", "!=", "Z invalid child"]],
		});

		expect(result.value).toBeInstanceOf(BadRequestError);
		expect((await service.get(root, "source-folder")).right.filters).toEqual([]);
	});
});

describe("NodeService permission filters", () => {
	it("returns no nodes when parent filters resolve to no matching folders", async () => {
		const { service } = setup();
		await folder(service, "private-folder");
		await file(service, "private-folder");
		for (const ctx of [user, root]) {
			const result = await service.find(ctx, [["@uuid", "==", "nonexistent"]]);
			expect(result.isRight()).toBe(true);
			expect(result.right.nodes).toEqual([]);
		}
	});

	it("finds nodes readable through a secondary group", async () => {
		const { service } = setup();
		await folder(service, "group-folder", [], {
			group: "editors",
			permissions: { authenticated: [], anonymous: [], group: ["Read"], advanced: {} },
		});
		await file(service, "group-folder");

		expect((await service.get(user, "content")).isRight()).toBe(true);
		const found = await service.find(user, [["uuid", "==", "content"]]);
		expect(found.right.nodes.map((node) => node.uuid)).toEqual(["content"]);
	});

	it("matches direct root access even when the context has no admin group", async () => {
		const { service } = setup();
		await folder(service, "private-folder");
		await file(service, "private-folder");
		const ctx = { ...root, principal: { ...root.principal, groups: [] } };

		expect((await service.get(ctx, "content")).isRight()).toBe(true);
		expect((await service.find(ctx, [["uuid", "==", "content"]])).right.nodes).toHaveLength(1);
	});
});

class FailingUpdateRepository extends InMemoryNodeRepository {
	failUuid?: string;
	override update(node: NodeLike): ReturnType<InMemoryNodeRepository["update"]> {
		return node.uuid === this.failUuid
			? Promise.resolve(left(new NodeNotFoundError(node.uuid)))
			: super.update(node);
	}
}
