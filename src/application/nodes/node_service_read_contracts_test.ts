import { describe, it } from "bdd";
import { expect } from "expect";
import { InMemoryConfigurationRepository } from "adapters/inmem/inmem_configuration_repository.ts";
import { InMemoryEventBus } from "adapters/inmem/inmem_event_bus.ts";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository.ts";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider.ts";
import { Groups } from "domain/users_groups/groups.ts";
import { Users } from "domain/users_groups/users.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";
import { ForbiddenError } from "shared/antbox_error.ts";
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

const readerCtx: AuthenticationContext = {
	mode: "Direct",
	tenant: "test",
	principal: {
		email: "reader@example.com",
		groups: ["readers"],
	},
};

function createHarness() {
	const repository = new InMemoryNodeRepository();
	const service = new NodeService({
		repository,
		storage: new InMemoryStorageProvider(),
		bus: new InMemoryEventBus(),
		configRepo: new InMemoryConfigurationRepository(),
	});
	return { repository, service };
}

async function createFolder(
	service: NodeService,
	uuid: string,
	title: string,
	parent = Nodes.ROOT_FOLDER_UUID,
	isPublic = true,
) {
	return await service.create(adminCtx, {
		uuid,
		title,
		parent,
		mimetype: Nodes.FOLDER_MIMETYPE,
		filters: [],
		permissions: {
			group: ["Read", "Write", "Export"],
			authenticated: isPublic ? ["Read"] : [],
			anonymous: [],
			advanced: {},
		},
	});
}

describe("NodeService read contracts", () => {
	it("returns breadcrumbs from root to the requested node", async () => {
		const { service } = createHarness();
		await createFolder(service, "accounts", "Accounts");
		await createFolder(service, "invoices", "Invoices", "accounts");
		await service.create(adminCtx, {
			uuid: "invoice-42",
			title: "Invoice 42",
			parent: "invoices",
			mimetype: Nodes.META_NODE_MIMETYPE,
		});

		const result = await service.breadcrumbs(adminCtx, "invoice-42");

		expect(result.isRight()).toBe(true);
		expect(result.right).toEqual([
			{ uuid: Nodes.ROOT_FOLDER_UUID, title: "Root" },
			{ uuid: "accounts", title: "Accounts" },
			{ uuid: "invoices", title: "Invoices" },
			{ uuid: "invoice-42", title: "Invoice 42" },
		]);
	});

	it("returns an error when breadcrumbs target does not exist", async () => {
		const { service } = createHarness();

		const result = await service.breadcrumbs(adminCtx, "missing-node");

		expect(result.isLeft()).toBe(true);
		expect(result.value).toBeInstanceOf(NodeNotFoundError);
	});

	it("does not disclose breadcrumbs for an unreadable node", async () => {
		const { service } = createHarness();
		await createFolder(service, "private-folder", "Private", Nodes.ROOT_FOLDER_UUID, false);
		await service.create(adminCtx, {
			uuid: "private-node",
			title: "Confidential contract",
			parent: "private-folder",
			mimetype: Nodes.META_NODE_MIMETYPE,
		});

		const result = await service.breadcrumbs(readerCtx, "private-node");

		expect(result.isLeft()).toBe(true);
		expect(result.value).toBeInstanceOf(ForbiddenError);
	});

	it("returns embedding contents only for readable nodes", async () => {
		const { repository, service } = createHarness();
		await createFolder(service, "public-folder", "Public");
		await createFolder(service, "private-folder", "Private", Nodes.ROOT_FOLDER_UUID, false);
		await service.create(adminCtx, {
			uuid: "public-node",
			title: "Public node",
			parent: "public-folder",
			mimetype: Nodes.META_NODE_MIMETYPE,
		});
		await service.create(adminCtx, {
			uuid: "private-node",
			title: "Private node",
			parent: "private-folder",
			mimetype: Nodes.META_NODE_MIMETYPE,
		});
		await repository.upsertEmbedding("public-node", [1], "public content");
		await repository.upsertEmbedding("private-node", [1], "private content");

		const result = await service.getEmbeddingContents(readerCtx, [
			"public-node",
			"private-node",
			"missing-node",
			"public-node",
		]);

		expect(result.isRight()).toBe(true);
		expect(result.right).toEqual({ "public-node": "public content" });
	});

	it("lists folders before files and sorts each group by title", async () => {
		const { service } = createHarness();
		await createFolder(service, "parent", "Parent");
		await createFolder(service, "folder-alpha", "Alpha folder", "parent");
		await service.create(adminCtx, {
			uuid: "smart-zulu",
			title: "Zulu smart folder",
			parent: "parent",
			mimetype: Nodes.SMART_FOLDER_MIMETYPE,
			filters: [["title", "match", "invoice"]],
		});
		for (const [uuid, title] of [["file-zulu", "Zulu file"], ["file-alpha", "Alpha file"]]) {
			await service.create(adminCtx, {
				uuid,
				title,
				parent: "parent",
				mimetype: Nodes.META_NODE_MIMETYPE,
			});
		}

		const result = await service.list(adminCtx, "parent");

		expect(result.isRight()).toBe(true);
		expect(result.right.map((node) => node.title)).toEqual([
			"Alpha folder",
			"Zulu smart folder",
			"Alpha file",
			"Zulu file",
		]);
	});

	it("accepts the root folder in fid form", async () => {
		const { service } = createHarness();
		await createFolder(service, "root-child", "Root child");

		const result = await service.list(
			adminCtx,
			Nodes.fidToUuid(Nodes.ROOT_FOLDER_UUID),
		);

		expect(result.isRight()).toBe(true);
		expect(result.right.map((node) => node.uuid)).toContain("root-child");
	});

	it("parses structured string filters", async () => {
		const { service } = createHarness();
		await createFolder(service, "parent", "Parent");
		await service.create(adminCtx, {
			uuid: "text-node",
			title: "Text",
			parent: "parent",
			mimetype: "text/plain",
		});
		await service.create(adminCtx, {
			uuid: "json-node",
			title: "JSON",
			parent: "parent",
			mimetype: "application/json",
		});

		const result = await service.find(adminCtx, "mimetype == text/plain");

		expect(result.isRight()).toBe(true);
		expect(result.right.nodes.map((node) => node.uuid)).toEqual(["text-node"]);
	});

	it("falls back to full-text search for plain strings", async () => {
		const { service } = createHarness();
		await createFolder(service, "parent", "Parent");
		await service.create(adminCtx, {
			uuid: "matching-node",
			title: "Quarterly contract archive",
			parent: "parent",
			mimetype: Nodes.META_NODE_MIMETYPE,
		});
		await service.create(adminCtx, {
			uuid: "other-node",
			title: "Meeting notes",
			parent: "parent",
			mimetype: Nodes.META_NODE_MIMETYPE,
		});

		const result = await service.find(adminCtx, "quarterly contract");

		expect(result.isRight()).toBe(true);
		expect(result.right.nodes.map((node) => node.uuid)).toEqual(["matching-node"]);
	});

	it("paginates regular search results", async () => {
		const { service } = createHarness();
		await createFolder(service, "parent", "Parent");
		for (
			const [uuid, title] of [["node-a", "Alpha"], ["node-b", "Bravo"], ["node-c", "Charlie"]]
		) {
			await service.create(adminCtx, {
				uuid,
				title,
				parent: "parent",
				mimetype: Nodes.META_NODE_MIMETYPE,
			});
		}

		const result = await service.find(
			adminCtx,
			[["parent", "==", "parent"]],
			2,
			2,
		);

		expect(result.isRight()).toBe(true);
		expect(result.right.pageSize).toBe(2);
		expect(result.right.pageToken).toBe(2);
		expect(result.right.nodes.map((node) => node.uuid)).toEqual(["node-c"]);
	});
});
