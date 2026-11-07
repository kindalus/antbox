import { describe, it } from "bdd";
import { expect } from "expect";
import { InMemoryConfigurationRepository } from "adapters/inmem/inmem_configuration_repository.ts";
import { InMemoryEventBus } from "adapters/inmem/inmem_event_bus.ts";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository.ts";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider.ts";
import type { RagDocument } from "domain/ai/rag_document.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { Groups } from "domain/users_groups/groups.ts";
import { Users } from "domain/users_groups/users.ts";
import { right } from "shared/either.ts";
import type { AuthenticationContext } from "../security/authentication_context.ts";
import { NodeService } from "./node_service.ts";
import { NodeServiceProxy } from "./node_service_proxy.ts";

const adminCtx: AuthenticationContext = {
	mode: "Direct",
	tenant: "test",
	principal: {
		email: Users.ROOT_USER_EMAIL,
		groups: [Groups.ADMINS_GROUP_UUID],
	},
};

function createService(repository = new InMemoryNodeRepository()) {
	return new NodeService({
		repository,
		storage: new InMemoryStorageProvider(),
		bus: new InMemoryEventBus(),
		configRepo: new InMemoryConfigurationRepository(),
	});
}

async function createFolder(
	service: NodeService,
	uuid: string,
	group: string,
	isPublic: boolean,
) {
	await service.create(adminCtx, {
		uuid,
		title: uuid,
		parent: Nodes.ROOT_FOLDER_UUID,
		mimetype: Nodes.FOLDER_MIMETYPE,
		group,
		filters: [],
		permissions: {
			group: ["Read", "Write"],
			authenticated: isPublic ? ["Read"] : [],
			anonymous: [],
			advanced: {},
		},
	});
}

async function createNode(service: NodeService, uuid: string, parent: string) {
	await service.create(adminCtx, {
		uuid,
		title: uuid,
		parent,
		mimetype: Nodes.META_NODE_MIMETYPE,
	});
}

describe("NodeServiceProxy", () => {
	it("keeps a defensive copy of its authentication context", async () => {
		const service = createService();
		await createFolder(service, "editors-folder", "editors", false);
		await createNode(service, "editors-node", "editors-folder");
		const originalCtx: AuthenticationContext = {
			mode: "Direct",
			tenant: "test",
			principal: {
				email: "editor@example.com",
				groups: ["editors"],
			},
		};
		const proxy = new NodeServiceProxy(service, originalCtx);
		originalCtx.principal.groups.splice(0, 1, "other-group");

		const result = await proxy.get("editors-node");

		expect(result.isRight()).toBe(true);
		expect(result.right.uuid).toBe("editors-node");
	});

	it("enforces the bound principal permissions", async () => {
		const service = createService();
		await createFolder(service, "private-folder", "private-group", false);
		await createNode(service, "private-node", "private-folder");
		const proxy = new NodeServiceProxy(service, {
			mode: "Direct",
			tenant: "test",
			principal: {
				email: "reader@example.com",
				groups: ["readers"],
			},
		});

		const result = await proxy.get("private-node");

		expect(result.isLeft()).toBe(true);
	});

	it("reads exact embedding contents using the immutable bound principal", async () => {
		const repository = new InMemoryNodeRepository();
		const service = createService(repository);
		await createFolder(service, "public-content", "public", true);
		await createFolder(service, "private-content", "private", false);
		await createNode(service, "visible-document", "public-content");
		await createNode(service, "hidden-document", "private-content");
		await repository.saveContent("visible-document", {
			markdown: "DU - Nota de Valor - Secção Geral",
		});
		await repository.upsertEmbedding("visible-document", [1, 0]);
		await repository.saveContent("hidden-document", { markdown: "Private document body" });
		await repository.upsertEmbedding("hidden-document", [0, 1]);
		const ctx: AuthenticationContext = {
			mode: "Action",
			tenant: "test",
			principal: { email: "reader@example.com", groups: ["readers"] },
		};
		const proxy = new NodeServiceProxy(service, ctx);
		ctx.principal.groups.push(Groups.ADMINS_GROUP_UUID);
		const result = await proxy.getEmbeddingContents([
			"visible-document",
			"hidden-document",
			"missing-document",
		]);
		expect(result.isRight()).toBe(true);
		expect(result.right).toEqual({ "visible-document": "DU - Nota de Valor - Secção Geral" });
	});

	it("returns an error when semantic query is unavailable", async () => {
		const proxy = new NodeServiceProxy(createService(), adminCtx);

		const result = await proxy.semanticQuery("invoice terms");

		expect(result.isLeft()).toBe(true);
		expect(result.value).toBe("Service not available");
	});

	it("asks NodeService for semantic documents with the bound context and topK 10", async () => {
		const calls: { ctx: AuthenticationContext; text: string; topK: number }[] = [];
		const documents: RagDocument[] = [
			{ uuid: "public-node", title: "Public", content: "public", score: 0.8 },
		];
		const service = {
			supportsSemanticSearch: () => true,
			semanticDocuments: (ctx: AuthenticationContext, text: string, topK: number) => {
				calls.push({ ctx, text, topK });
				return Promise.resolve(right(documents));
			},
		} as unknown as NodeService;
		const proxy = new NodeServiceProxy(service, {
			mode: "Direct",
			tenant: "test",
			principal: {
				email: "reader@example.com",
				groups: ["readers"],
			},
		});

		const result = await proxy.semanticQuery("contracts");

		expect(result.isRight()).toBe(true);
		expect(result.value).toEqual(documents);
		expect(calls).toHaveLength(1);
		expect(calls[0].text).toBe("contracts");
		expect(calls[0].topK).toBe(10);
		expect(calls[0].ctx.principal.email).toBe("reader@example.com");
	});
});
