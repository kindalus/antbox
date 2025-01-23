import { assertFalse, assertStrictEquals } from "../../dev_deps.ts";
import { InMemoryNodeRepository } from "../adapters/inmem/inmem_node_repository.ts";
import { InMemoryStorageProvider } from "../adapters/inmem/inmem_storage_provider.ts";
import { FolderNode } from "../domain/nodes/folder_node.ts";
import { FolderNotFoundError } from "../domain/nodes/folder_not_found_error.ts";
import { MetaNode } from "../domain/nodes/meta_node.ts";
import { Node } from "../domain/nodes/node.ts";
import { NodeLike } from "../domain/nodes/node_like.ts";
import { NodeFilterResult } from "../domain/nodes/node_repository.ts";
import { AntboxError } from "../shared/antbox_error.ts";
import { NodeService } from "./node_service.ts";
import { NodeServiceContext } from "./node_service_context.ts";

Deno.test("createFile", async (t) => {
	await t.step(
		"Devolve FolderNotFoundError se o parent não existir no repositório",
		async () => {
			const svc = new NodeService(makeServiceContext());

			const file = new File([""], "test.txt", { type: "text/plain" });

			const result = await svc.createFile(file, { parent: "bad_parent_uuid" });

			assertFalse(result.isRight());
			assertStrictEquals(
				(result.value as AntboxError).errorCode,
				FolderNotFoundError.ERROR_CODE,
			);
		},
	);
});

Deno.test("query @filters", async (t) => {
	const ctx = makeServiceContext();
	ctx.repository.add(
		FolderNode.create({ uuid: "--caes--", title: "Caes" }).value as FolderNode,
	);
	ctx.repository.add(
		new Node({
			title: "Bobby",
			parent: "--caes--",
			aspects: ["fcp"],
		}) as NodeLike,
	);

	ctx.repository.add(
		MetaNode.create({
			title: "Laika",
			parent: "--caes--",
		}).value as MetaNode,
	);

	ctx.repository.add(
		FolderNode.create({ uuid: "--gatos--", title: "Gatos" }).value as FolderNode,
	);
	ctx.repository.add(
		MetaNode.create({
			title: "Tarego",
			parent: "--gatos--",
			aspects: ["fcp"],
		}).value as MetaNode,
	);

	const srv = new NodeService(ctx);

	await t.step("Devolve apenas os nodes que correspondem ao filtro", async () => {
		const result = await srv.find([
			["@title", "==", "Gatos"],
			["aspects", "contains", "fcp"],
		], 10);

		assertStrictEquals(result.isRight(), true, JSON.stringify(result.value));

		assertStrictEquals((result.value as NodeFilterResult).nodes.length, 1);
		assertStrictEquals(
			(result.value as NodeFilterResult).nodes[0].title,
			"Tarego",
			"O node encontrado devia ser do gato Tarego",
		);
	});

	await t.step("Não devolve nada se os @filters não devolverem nada", async () => {
		const result = await srv.find([
			["@title", "==", "Caprinos"],
			["aspects", "contains", "fcp"],
		], 10);

		assertStrictEquals(result.isRight(), true, JSON.stringify(result.value));

		assertStrictEquals(
			(result.value as NodeFilterResult).nodes.length,
			0,
			`A lista de nodes deveria estar vazia: ${JSON.stringify(result.value)} `,
		);
	});
});

function makeServiceContext(): NodeServiceContext {
	return {
		repository: new InMemoryNodeRepository(),
		storage: new InMemoryStorageProvider(),
		fidGenerator: { generate: () => "fid" },
		uuidGenerator: { generate: () => "uuid" },
	};
}
