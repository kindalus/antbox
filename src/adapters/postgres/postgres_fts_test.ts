import { afterAll, beforeAll, describe, it } from "bdd";
import process from "node:process";
import { expect } from "expect";
import postgres from "postgres";
import { FileNode } from "domain/nodes/file_node.ts";
import { PostgresNodeRepository } from "./postgres_node_repository.ts";

/** Needs a database with pgvector available, like the embedding dimensions test. */
const postgresUrl = process.env.ANTBOX_TEST_PGVECTOR_URL;

const fileNode = (uuid: string, title: string) =>
	FileNode.create({ uuid, title, mimetype: "text/plain", owner: "tester@antbox.io" }).right;

(postgresUrl ? describe : describe.skip)("PostgresNodeRepository full-text search", () => {
	let admin: postgres.Sql;
	const schemas: string[] = [];
	const repositories: PostgresNodeRepository[] = [];

	const scopedUrl = async () => {
		const schema = `antbox_test_${crypto.randomUUID().replaceAll("-", "")}`;
		schemas.push(schema);
		await admin`CREATE SCHEMA ${admin(schema)}`;
		const url = new URL(postgresUrl!);
		url.searchParams.set("search_path", `${schema},public`);
		return { schema, url: url.href };
	};

	const open = async (url: string) => {
		const repository = new PostgresNodeRepository(url);
		repositories.push(repository);
		const initialized = await repository.initialize();
		if (initialized.isLeft()) throw initialized.value;
		return repository;
	};

	const legacyTable = async (schema: string, extraColumns = "") => {
		const nodes = admin(`${schema}.nodes`);
		await admin.unsafe(`CREATE TABLE "${schema}".nodes (
			uuid TEXT PRIMARY KEY, fid TEXT NOT NULL, title TEXT, parent TEXT, mimetype TEXT,
			body JSONB NOT NULL, embedding vector(768), embedding_content_md TEXT ${extraColumns}
		)`);
		const node = fileNode("legacy_node", "Relatório antigo");
		await admin`INSERT INTO ${nodes} (uuid, fid, title, mimetype, body, embedding_content_md)
			VALUES (${node.uuid}, ${node.fid}, ${node.title}, ${node.mimetype},
				${admin.json({ ...node.metadata, fulltext: "relatorio antigo" } as never)},
				'---\ntitle: x\n---\n\nCorpo antigo')`;
		return node;
	};

	beforeAll(async () => {
		admin = postgres(postgresUrl!, { onnotice: () => {} });
		await admin`CREATE EXTENSION IF NOT EXISTS vector`;
	});

	afterAll(async () => {
		await Promise.all(repositories.map((repository) => repository.close()));
		for (const schema of schemas) await admin`DROP SCHEMA ${admin(schema)} CASCADE`;
		await admin.end();
	});

	it("adds the search columns to an existing table and lists its nodes for migration", async () => {
		const { schema, url } = await scopedUrl();
		const node = await legacyTable(schema);

		const repository = await open(url);
		expect((await repository.listWithoutSearchContent(10)).right).toEqual([node.uuid]);
		expect((await repository.fts("relatorio", { pageSize: 10, pageToken: 1 })).right.nodes)
			.toHaveLength(0);
		expect((await repository.getContents([node.uuid])).right[node.uuid]).toContain(
			"Corpo antigo",
		);

		await repository.saveContent(node.uuid, {
			markdown: "md",
			searchMeta: node.title,
			searchBody: "Corpo antigo",
		});
		expect((await repository.listWithoutSearchContent(10)).right).toEqual([]);
		for (const query of ["relatorio", "RELATÓRIO", "corpo antig"]) {
			const found = await repository.fts(query, { pageSize: 10, pageToken: 1 });
			expect(found.right.nodes.map((n) => n.uuid), query).toEqual([node.uuid]);
		}

		const [{ config }] = await admin.unsafe<{ config: string }[]>(
			`SELECT pg_get_expr(d.adbin, d.adrelid) AS config FROM pg_attrdef d
			JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
			WHERE a.attrelid = '"${schema}".nodes'::regclass AND a.attname = 'search_vector'`,
		);
		expect(config).toContain("antbox_pt");

		const again = await open(url);
		const found = await again.fts("relatorio", { pageSize: 10, pageToken: 1 });
		expect(found.right.nodes.map((n) => n.uuid)).toEqual([node.uuid]);
	});

	it("keeps searching with the configuration an existing column was created with", async () => {
		const { schema, url } = await scopedUrl();
		// What initialize() creates when the unaccent extension cannot be installed.
		const node = await legacyTable(
			schema,
			`, search_meta TEXT, search_body TEXT,
			search_vector tsvector GENERATED ALWAYS AS (
				setweight(to_tsvector('portuguese'::regconfig, coalesce(search_meta, '')), 'A') ||
				setweight(to_tsvector('portuguese'::regconfig, coalesce(search_body, '')), 'B')
			) STORED`,
		);

		const repository = await open(url);
		await repository.saveContent(node.uuid, { markdown: "md", searchMeta: node.title });
		const search = async (query: string) =>
			(await repository.fts(query, { pageSize: 10, pageToken: 1 })).right.nodes.map((n) =>
				n.uuid
			);
		expect(await search("relatório")).toEqual([node.uuid]);
		expect(await search("relatórios")).toEqual([node.uuid]);
		// Without unaccent, accents count.
		expect(await search("relatorio")).toEqual([]);
	});
});
