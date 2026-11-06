import { afterAll, beforeAll, describe, it } from "bdd";
import process from "node:process";
import { expect } from "expect";
import postgres from "postgres";
import { DeterministicEmbeddingsProvider } from "adapters/embeddings/deterministic_embeddings_provider.ts";
import { EMBEDDING_DIMENSIONS } from "domain/nodes/embedding.ts";
import { FileNode } from "domain/nodes/file_node.ts";
import { PostgresNodeRepository } from "./postgres_node_repository.ts";

/** Needs a database with pgvector available, unlike ANTBOX_TEST_POSTGRES_URL. */
const postgresUrl = process.env.ANTBOX_TEST_PGVECTOR_URL;

const unit = (dimensions: number) =>
	Array.from({ length: dimensions }, (_, index) => index === 0 ? 1 : 0);

const fileNode = (uuid: string) =>
	FileNode.create({
		uuid,
		title: uuid,
		mimetype: "text/plain",
		owner: "tester@antbox.io",
		size: 1,
		properties: {},
	}).right;

(postgresUrl ? describe : describe.skip)("PostgresNodeRepository embedding dimensions", () => {
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

	beforeAll(async () => {
		admin = postgres(postgresUrl!, { onnotice: () => {} });
		await admin`CREATE EXTENSION IF NOT EXISTS vector`;
	});

	afterAll(async () => {
		await Promise.all(repositories.map((repository) => repository.close()));
		for (const schema of schemas) await admin`DROP SCHEMA ${admin(schema)} CASCADE`;
		await admin.end();
	});

	it("stores and finds what the default provider emits", async () => {
		const { url } = await scopedUrl();
		const repository = await open(url);
		const node = fileNode("fresh_node");
		expect((await repository.add(node)).isRight()).toBe(true);
		const embedded = await new DeterministicEmbeddingsProvider().embed(["some text"]);
		const [vector] = embedded.right.embeddings;

		expect((await repository.upsertEmbedding(node.uuid, vector, "Body")).isRight()).toBe(true);

		const found = await repository.vectorSearch(vector, 1);
		expect(found.right.nodes[0].node.uuid).toBe(node.uuid);
	});

	it("resizes a column created with another dimension and keeps the nodes", async () => {
		const { schema, url } = await scopedUrl();
		const nodes = admin(`${schema}.nodes`);
		await admin`CREATE TABLE ${nodes} (
			uuid TEXT PRIMARY KEY, fid TEXT NOT NULL, title TEXT, parent TEXT, mimetype TEXT,
			body JSONB NOT NULL, embedding vector(1536), embedding_content_md TEXT
		)`;
		const node = fileNode("legacy_node");
		await admin`INSERT INTO ${nodes} (uuid, fid, title, mimetype, body, embedding, embedding_content_md)
			VALUES (${node.uuid}, ${node.fid}, ${node.title}, ${node.mimetype},
				${admin.json(node.metadata as never)}, ${`[${
			unit(1536).join(",")
		}]`}::vector, 'Stored body')`;

		const repository = await open(url);

		expect((await repository.getById(node.uuid)).isRight()).toBe(true);
		expect((await repository.getEmbeddingContents([node.uuid])).right[node.uuid]).toBe(
			"Stored body",
		);
		const [{ stale }] = await admin`SELECT count(*)::int AS stale FROM ${nodes}
			WHERE embedding IS NOT NULL`;
		expect(stale).toBe(0);

		const vector = unit(EMBEDDING_DIMENSIONS);
		expect((await repository.upsertEmbedding(node.uuid, vector, "New body")).isRight()).toBe(
			true,
		);
		expect((await repository.vectorSearch(vector, 1)).right.nodes).toHaveLength(1);
	});

	it("keeps vectors of the right size when initialized again", async () => {
		const { url } = await scopedUrl();
		const repository = await open(url);
		const node = fileNode("stable_node");
		const vector = unit(EMBEDDING_DIMENSIONS);
		await repository.add(node);
		await repository.upsertEmbedding(node.uuid, vector, "Body");

		const again = await open(url);

		expect((await again.vectorSearch(vector, 1)).right.nodes).toHaveLength(1);
	});

	it("restores the vector index after resizing", async () => {
		const { schema, url } = await scopedUrl();
		await admin`CREATE TABLE ${admin(`${schema}.nodes`)} (
			uuid TEXT PRIMARY KEY, fid TEXT NOT NULL, title TEXT, parent TEXT, mimetype TEXT,
			body JSONB NOT NULL, embedding vector(1536), embedding_content_md TEXT
		)`;
		await admin`CREATE INDEX idx_nodes_embedding ON ${admin(`${schema}.nodes`)}
			USING hnsw (embedding vector_cosine_ops)`;

		await open(url);

		const [index] = await admin`SELECT indexdef FROM pg_indexes
			WHERE schemaname = ${schema} AND indexname = 'idx_nodes_embedding'`;
		expect(index.indexdef).toContain("hnsw");
	});
});
