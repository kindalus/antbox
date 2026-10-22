import { describe, it } from "bdd";
import { expect } from "expect";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository.ts";
import { AuthorizationService } from "application/security/authorization_service.ts";
import type { AuthenticationContext } from "application/security/authentication_context.ts";
import { Users } from "domain/users_groups/users.ts";
import { FileNode } from "domain/nodes/file_node.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { right } from "shared/either.ts";
import { FindService } from "./find_service.ts";
import type { NodeServiceContext } from "./node_service_context.ts";

const ctx: AuthenticationContext = {
	tenant: "default",
	mode: "Direct",
	principal: { email: Users.ROOT_USER_EMAIL, groups: [] },
};

Deno.test("FindService preserves every parent constraint when resolving parent metadata", async () => {
	const repository = new InMemoryNodeRepository();
	const file = FileNode.create({
		uuid: "matching-file",
		title: "Example",
		mimetype: "text/plain",
		owner: Users.ROOT_USER_EMAIL,
		parent: Nodes.ROOT_FOLDER_UUID,
	});
	expect(file.isRight()).toBe(true);
	await repository.add(file.right);
	const service = new FindService(
		{ repository } as unknown as NodeServiceContext,
		new AuthorizationService(),
	);
	const noMatch = await service.find(ctx, [
		["@title", "==", "Root"],
		["parent", "==", Nodes.ROOT_FOLDER_UUID],
		["parent", "!=", Nodes.ROOT_FOLDER_UUID],
	]);
	expect(noMatch.isRight()).toBe(true);
	expect(noMatch.right.nodes).toEqual([]);
	const match = await service.find(ctx, [
		["@title", "==", "Root"],
		["parent", "in", [Nodes.ROOT_FOLDER_UUID, "other-folder"]],
		["parent", "!=", "other-folder"],
	]);
	expect(match.isRight()).toBe(true);
	expect(match.right.nodes.map((node) => node.uuid)).toEqual(["matching-file"]);
});

describe("FindService pagination", () => {
	it("rejects invalid values before repository queries and preserves internal bulk reads", async () => {
		const repo = new InMemoryNodeRepository();
		let queries = 0;
		repo.filter = (_filters, pageSize = 20, pageToken = 1) => {
			queries++;
			return Promise.resolve({ nodes: [], pageSize, pageToken });
		};
		const service = new FindService(
			{ repository: repo } as unknown as NodeServiceContext,
			new AuthorizationService(),
		);
		for (
			const [size, page] of [[-1, 2], [0, 1], [1.5, 1], [20, 0], [20, 1.5], [
				20,
				Number.MAX_SAFE_INTEGER,
			]]
		) {
			expect((await service.find(ctx, [], size, page)).isLeft()).toBe(true);
		}
		expect(queries).toBe(0);
		expect((await service.find(ctx, [], Number.MAX_SAFE_INTEGER, 1)).isRight()).toBe(true);
		expect(queries).toBe(1);
	});

	it("bounds semantic result windows before embedding and allows the last valid page", async () => {
		const repo = new InMemoryNodeRepository();
		let embeddings = 0;
		const topKs: number[] = [];
		repo.supportsEmbeddings = () => true;
		repo.vectorSearch = (_embedding, topK = 0) => {
			topKs.push(topK);
			return Promise.resolve(right({ nodes: [] }));
		};
		const service = new FindService({
			repository: repo,
			embeddingsProvider: {
				relevanceThreshold: () => 0,
				embed: () => {
					embeddings++;
					return Promise.resolve(right({ embeddings: [[1]] }));
				},
			},
		} as unknown as NodeServiceContext, new AuthorizationService());
		expect((await service.find(ctx, "?invoices", 200, 51)).isLeft()).toBe(true);
		expect(embeddings).toBe(0);
		expect(topKs).toHaveLength(0);
		expect((await service.find(ctx, "?invoices", 200, 50)).isRight()).toBe(true);
		expect(embeddings).toBe(1);
		expect(topKs).toEqual([10_000]);
	});
});
