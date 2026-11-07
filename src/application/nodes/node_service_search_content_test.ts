import { describe, it } from "bdd";
import { expect } from "expect";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { InMemoryConfigurationRepository } from "adapters/inmem/inmem_configuration_repository.ts";
import { InMemoryEventBus } from "adapters/inmem/inmem_event_bus.ts";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository.ts";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider.ts";
import { SqliteNodeRepository } from "adapters/sqlite/sqlite_node_repository.ts";
import { FileNode } from "domain/nodes/file_node.ts";
import { FolderNode } from "domain/nodes/folder_node.ts";
import type { NodeRepository } from "domain/nodes/node_repository.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { Groups } from "domain/users_groups/groups.ts";
import { Users } from "domain/users_groups/users.ts";
import { right } from "shared/either.ts";
import { BadRequestError } from "shared/antbox_error.ts";
import type { AuthenticationContext } from "../security/authentication_context.ts";
import { embeddingMarkdownBody } from "./node_markdown.ts";
import { NodeService } from "./node_service.ts";

const ctx: AuthenticationContext = {
	mode: "Direct",
	tenant: "",
	principal: { email: Users.ROOT_USER_EMAIL, groups: [Groups.ADMINS_GROUP_UUID] },
};

function serviceWith(repository: NodeRepository) {
	return new NodeService({
		repository,
		storage: new InMemoryStorageProvider(),
		bus: new InMemoryEventBus(),
		configRepo: new InMemoryConfigurationRepository(),
	});
}

const repositories: [string, () => NodeRepository & { close?: () => void }][] = [
	["in-memory", () => new InMemoryNodeRepository()],
	["sqlite", () => new SqliteNodeRepository()],
];

for (const [name, makeRepository] of repositories) {
	describe(`NodeService search content (${name})`, () => {
		const setup = async () => {
			const repository = makeRepository();
			const service = serviceWith(repository);
			const folder = await service.create(ctx, {
				uuid: "docs",
				title: "Documents",
				mimetype: Nodes.FOLDER_MIMETYPE,
				parent: Nodes.ROOT_FOLDER_UUID,
			});
			expect(folder.isRight()).toBe(true);
			const file = await service.createFile(
				ctx,
				new File(["walrus inside the file"], "notes.txt", { type: "text/plain" }),
				{
					uuid: "notes",
					parent: "docs",
					title: "Quarterly notes",
					description: "Harbour planning",
					tags: ["logistics"],
				},
			);
			expect(file.isRight()).toBe(true);
			const markdown = async () => (await repository.getContents(["notes"])).right.notes;
			const found = async (query: string) =>
				(await service.find(ctx, query)).right.nodes.map((node) => node.uuid);
			return { repository, service, markdown, found };
		};

		it("stores the frontmatter on create and searches only the metadata without AI", async () => {
			const { repository, markdown, found } = await setup();
			try {
				const stored = await markdown();
				expect(stored).toStartWith("---\nuuid: notes\n");
				expect(stored).toContain("title: Quarterly notes");
				expect(stored).toContain("owner: root@antbox.io");
				expect(embeddingMarkdownBody(stored)).toBe("");

				for (const query of ["quarterly", "harbour", "logistics", "documents"]) {
					expect(await found(query), query).toEqual(
						query === "documents" ? ["docs"] : ["notes"],
					);
				}
				// The file text is not extracted without AI, and uuids or owners are not searched.
				expect(await found("walrus")).toEqual([]);
				expect(await found("root antbox")).toEqual([]);
				expect((await repository.listWithoutSearchContent(10)).right).toEqual([]);
			} finally {
				repository.close?.();
			}
		});

		it("keeps the extracted body on a metadata change and clears it when the file changes", async () => {
			const { repository, service, markdown, found } = await setup();
			try {
				// What text extraction stores once OCR is done.
				await repository.saveContent("notes", {
					markdown: `${await markdown()}\n\nThe walrus is extracted text`,
					searchBody: "The walrus is extracted text",
				});
				expect(await found("walrus")).toEqual(["notes"]);

				expect((await service.update(ctx, "notes", { title: "Renamed notes" })).isRight())
					.toBe(true);
				expect(await found("walrus")).toEqual(["notes"]);
				expect(await found("renamed")).toEqual(["notes"]);
				expect(await found("quarterly")).toEqual([]);
				expect(await markdown()).toContain("title: Renamed notes");
				expect(embeddingMarkdownBody(await markdown())).toBe("The walrus is extracted text");

				const changed = await service.updateFile(
					ctx,
					"notes",
					new File(["new text"], "notes.txt", { type: "text/plain" }),
				);
				expect(changed.isRight()).toBe(true);
				expect(await found("walrus")).toEqual([]);
				expect(await found("renamed")).toEqual(["notes"]);
				expect(embeddingMarkdownBody(await markdown())).toBe("");
				expect(await markdown()).toContain("size: 8");
			} finally {
				repository.close?.();
			}
		});

		it("rejects fulltext in folder filters but accepts it in smart folders", async () => {
			const { repository, service, found } = await setup();
			try {
				const filters = [["fulltext", "match", "quarterly"]];
				const folder = await service.create(ctx, {
					title: "Text rules",
					mimetype: Nodes.FOLDER_MIMETYPE,
					parent: Nodes.ROOT_FOLDER_UUID,
					filters,
				} as never);
				expect(folder.isLeft()).toBe(true);
				expect(folder.value).toBeInstanceOf(BadRequestError);
				expect((await service.update(ctx, "docs", { filters } as never)).isLeft()).toBe(true);

				const smart = await service.create(ctx, {
					uuid: "smart",
					title: "Quarterly search",
					mimetype: Nodes.SMART_FOLDER_MIMETYPE,
					parent: Nodes.ROOT_FOLDER_UUID,
					filters,
				} as never);
				expect(smart.isRight()).toBe(true);
				expect((await service.evaluate(ctx, "smart")).right.map((node) => node.uuid).sort())
					.toEqual(["notes", "smart"]);
				expect((await found("quarterly")).sort()).toEqual(["notes", "smart"]);
			} finally {
				repository.close?.();
			}
		});

		it("ignores a fulltext field sent by older clients", async () => {
			const { repository, service, found } = await setup();
			try {
				const created = await service.create(ctx, {
					uuid: "legacy-client",
					title: "Legacy client",
					mimetype: Nodes.FOLDER_MIMETYPE,
					parent: Nodes.ROOT_FOLDER_UUID,
					fulltext: "zeppelin",
				} as never);
				expect(created.isRight()).toBe(true);
				expect("fulltext" in created.right).toBe(false);
				expect(await found("zeppelin")).toEqual([]);

				const updated = await service.update(ctx, "legacy-client", {
					fulltext: "dirigible",
				} as never);
				expect(updated.isRight()).toBe(true);
				expect(await found("dirigible")).toEqual([]);
				expect("fulltext" in (await service.get(ctx, "legacy-client")).right).toBe(false);
			} finally {
				repository.close?.();
			}
		});
	});
}

describe("NodeService search migration", () => {
	it("makes nodes stored before full-text search searchable, once", async () => {
		const dir = mkdtempSync(join(tmpdir(), "antbox-search-migration-"));
		try {
			// The layout and rows of the previous version: a fulltext field in the JSON, and
			// markdown only for the node that was embedded.
			const old = new DatabaseSync(join(dir, "nodes.db"));
			old.exec(`
				CREATE TABLE nodes (
					uuid TEXT PRIMARY KEY,
					fid TEXT GENERATED ALWAYS AS (json_extract(body, '$.fid')) STORED,
					title TEXT GENERATED ALWAYS AS (json_extract(body, '$.title')) STORED,
					parent TEXT GENERATED ALWAYS AS (json_extract(body, '$.parent')) STORED,
					mimetype TEXT GENERATED ALWAYS AS (json_extract(body, '$.mimetype')) STORED,
					body JSON NOT NULL,
					embedding JSON,
					embedding_content_md TEXT,
					embedding_status TEXT,
					embedding_error TEXT,
					embedding_status_at TEXT
				);
			`);
			const folder = FolderNode.create({
				uuid: "archive",
				title: "Archive",
				owner: Users.ROOT_USER_EMAIL,
				group: Groups.ADMINS_GROUP_UUID,
				parent: Nodes.ROOT_FOLDER_UUID,
			}).right;
			const embedded = FileNode.create({
				uuid: "embedded",
				title: "Embedded contract",
				mimetype: "application/pdf",
				owner: Users.ROOT_USER_EMAIL,
				parent: "archive",
				tags: ["signed"],
			}).right;
			const plain = FileNode.create({
				uuid: "plain",
				title: "Plain invoice",
				mimetype: "application/pdf",
				owner: Users.ROOT_USER_EMAIL,
				parent: "archive",
			}).right;
			const insert = old.prepare(
				"INSERT INTO nodes (uuid, body, embedding_content_md) VALUES (?, ?, ?)",
			);
			for (
				const [node, markdown] of [
					[folder, null],
					[
						embedded,
						"---\nuuid: embedded\nfulltext: embedded contract\n---\n\nClause about penguins",
					],
					[plain, null],
				] as const
			) {
				insert.run(
					node.uuid,
					JSON.stringify({ ...node.metadata, fulltext: node.title.toLowerCase() }),
					markdown,
				);
			}
			old.close();

			const repository = new SqliteNodeRepository(dir);
			try {
				const service = serviceWith(repository);
				const found = async (query: string) =>
					(await service.find(ctx, query)).right?.nodes.map((node) => node.uuid).sort();
				expect(await found("invoice")).toEqual([]);

				expect((await service.migrateSearchContent(2)).right).toBe(3);
				expect(await found("invoice")).toEqual(["plain"]);
				expect(await found("signed")).toEqual(["embedded"]);
				expect(await found("penguins")).toEqual(["embedded"]);
				expect(await found("archive")).toEqual(["archive"]);

				const markdown = (await repository.getContents(["embedded", "plain"])).right;
				expect(markdown.embedded).toContain("title: Embedded contract");
				expect(markdown.embedded).not.toContain("fulltext");
				expect(embeddingMarkdownBody(markdown.embedded)).toBe("Clause about penguins");
				expect(embeddingMarkdownBody(markdown.plain)).toBe("");
				expect("fulltext" in (await service.get(ctx, "plain")).right).toBe(false);

				expect((await service.migrateSearchContent()).right).toBe(0);
			} finally {
				repository.close();
			}

			// The stored JSON keeps the legacy field for a rollback until the node is saved again.
			const after = new DatabaseSync(join(dir, "nodes.db"));
			const row = after.prepare(
				"SELECT json_extract(body, '$.fulltext') AS f FROM nodes WHERE uuid = ?",
			)
				.get("plain") as { f: string };
			after.close();
			expect(row.f).toBe("plain invoice");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("skips nodes it cannot store and still ends", async () => {
		const repository = new InMemoryNodeRepository();
		const service = serviceWith(repository);
		await repository.add(
			FolderNode.create({
				uuid: "good",
				title: "Good folder",
				owner: Users.ROOT_USER_EMAIL,
				group: Groups.ADMINS_GROUP_UUID,
				parent: Nodes.ROOT_FOLDER_UUID,
			}).right,
		);
		// "ghost" is listed but cannot be read, so it can never be migrated.
		const list = repository.listWithoutSearchContent.bind(repository);
		repository.listWithoutSearchContent = async (limit) =>
			right(["ghost", ...(await list(limit)).right].slice(0, limit));

		const migrated = await service.migrateSearchContent(1);
		expect(migrated.right).toBe(1);
		expect((await service.find(ctx, "good")).right.nodes.map((node) => node.uuid)).toEqual([
			"good",
		]);
	});
});
