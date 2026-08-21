import { describe, it } from "bdd";
import { expect } from "expect";
import { InMemoryConfigurationRepository } from "adapters/inmem/inmem_configuration_repository.ts";
import { InMemoryEventBus } from "adapters/inmem/inmem_event_bus.ts";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository.ts";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider.ts";
import type { RAGService } from "application/ai/rag_service.ts";
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

function createService() {
	return new NodeService({
		repository: new InMemoryNodeRepository(),
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
		const proxy = new NodeServiceProxy(service, undefined, originalCtx);
		originalCtx.principal.groups.splice(0, 1, "other-group");

		const result = await proxy.get("editors-node");

		expect(result.isRight()).toBe(true);
		expect(result.right.uuid).toBe("editors-node");
	});

	it("enforces the bound principal permissions", async () => {
		const service = createService();
		await createFolder(service, "private-folder", "private-group", false);
		await createNode(service, "private-node", "private-folder");
		const proxy = new NodeServiceProxy(service, undefined, {
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

	it("returns an error when semantic query is unavailable", async () => {
		const proxy = new NodeServiceProxy(createService(), undefined, adminCtx);

		const result = await proxy.semanticQuery("invoice terms");

		expect(result.isLeft()).toBe(true);
		expect(result.value).toBe("Service not available");
	});

	it("filters semantic results through the bound principal permissions", async () => {
		const service = createService();
		await createFolder(service, "public-folder", "public", true);
		await createFolder(service, "private-folder", "private", false);
		await createNode(service, "public-node", "public-folder");
		await createNode(service, "private-node", "private-folder");
		const rag = new StubRagService([
			{ uuid: "private-node", title: "Private", content: "private", score: 0.99 },
			{ uuid: "public-node", title: "Public", content: "public", score: 0.8 },
		]);
		const proxy = new NodeServiceProxy(service, rag as unknown as RAGService, {
			mode: "Direct",
			tenant: "test",
			principal: {
				email: "reader@example.com",
				groups: ["readers"],
			},
		});

		const result = await proxy.semanticQuery("contracts");

		expect(result.isRight()).toBe(true);
		if (result.isRight()) {
			const documents = result.value as RagDocument[];
			expect(documents.map((document) => document.uuid)).toEqual(["public-node"]);
		}
		expect(rag.lastQuery).toEqual({ text: "contracts", topK: 10 });
	});
});

class StubRagService {
	lastQuery?: { text: string; topK: number };

	constructor(private readonly documents: RagDocument[]) {}

	query(text: string, topK: number) {
		this.lastQuery = { text, topK };
		return Promise.resolve(right(this.documents));
	}
}
