import { afterAll, beforeAll, describe, it } from "bdd";
import { expect } from "expect";
import { Users } from "domain/users_groups/users.ts";
import { Groups } from "domain/users_groups/groups.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import type { NodeRepository } from "domain/nodes/node_repository.ts";
import type { AuthenticationContext } from "../security/authentication_context.ts";
import { NodeService } from "./node_service.ts";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository.ts";
import { SqliteNodeRepository } from "adapters/sqlite/sqlite_node_repository.ts";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider.ts";
import { InMemoryConfigurationRepository } from "adapters/inmem/inmem_configuration_repository.ts";
import { InMemoryEventBus } from "adapters/inmem/inmem_event_bus.ts";

const authCtx: AuthenticationContext = {
	mode: "Direct",
	tenant: "",
	principal: { email: Users.ROOT_USER_EMAIL, groups: [Groups.ADMINS_GROUP_UUID] },
};

const repositories: [string, () => NodeRepository & { close?: () => void }][] = [
	["in-memory", () => new InMemoryNodeRepository()],
	["sqlite", () => new SqliteNodeRepository()],
];

for (const [name, makeRepository] of repositories) {
	describe(`NodeService full-text search without AI (${name})`, () => {
		const repository = makeRepository();
		const service = new NodeService({
			repository,
			storage: new InMemoryStorageProvider(),
			bus: new InMemoryEventBus(),
			configRepo: new InMemoryConfigurationRepository(),
		});

		beforeAll(async () => {
			for (
				const [uuid, title] of [
					["accao", "Acção disciplinar"],
					["factura", "Factura de venda"],
					["numero", "Recibo nº 123/2024"],
					["relatorio", "Relatório-final"],
					["shorts", "Plano a de obra"],
				]
			) {
				await service.create(authCtx, {
					uuid,
					title,
					mimetype: Nodes.FOLDER_MIMETYPE,
					parent: Nodes.ROOT_FOLDER_UUID,
				});
			}
		});

		afterAll(() => repository.close?.());

		const search = async (query: string) => {
			const result = await service.find(authCtx, query);
			expect(result.isRight()).toBe(true);
			return result.right.nodes.map((node) => node.uuid).sort();
		};

		it("ignores accents and case in the query", async () => {
			expect(await search("acção")).toEqual(["accao"]);
			expect(await search("ACÇÃO disciplinar")).toEqual(["accao"]);
			expect(await search("RELATÓRIO")).toEqual(["relatorio"]);
		});

		it("finds titles that contain short words", async () => {
			expect(await search("factura de venda")).toEqual(["factura"]);
			expect(await search("plano a de obra")).toEqual(["shorts"]);
		});

		it("treats punctuation in the query as word separators", async () => {
			expect(await search("nº 123/2024")).toEqual(["numero"]);
			expect(await search("relatório-final")).toEqual(["relatorio"]);
		});

		it("still matches partial words when the query has only short words", async () => {
			expect(await search("fa")).toEqual(["factura"]);
		});

		it("searches fulltext filters given as arrays", async () => {
			const result = await service.find(authCtx, [["fulltext", "match", "Acção"]]);
			expect(result.right.nodes.map((node) => node.uuid)).toEqual(["accao"]);
		});

		it("leaves match on other fields unchanged", async () => {
			const result = await service.find(authCtx, [["title", "match", "Acção"]]);
			expect(result.right.nodes.map((node) => node.uuid)).toEqual(["accao"]);
			const unaccented = await service.find(authCtx, [["title", "match", "accao"]]);
			expect(unaccented.right.nodes).toHaveLength(0);
		});

		it("searches the text when semantic search falls back to full-text search", async () => {
			expect(await search("?acção")).toEqual(["accao"]);
			expect(await search("? factura de venda")).toEqual(["factura"]);
		});
	});
}
