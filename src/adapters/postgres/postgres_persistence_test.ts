import { expect } from "expect";
import postgres from "npm:postgres@3.4.8";
import { FileNode } from "domain/nodes/file_node.ts";
import buildConfiguration, {
	PostgresConfigurationRepository,
} from "./postgres_configuration_repository.ts";
import buildEventStore, {
	PostgresEventStoreRepository,
} from "./postgres_event_store_repository.ts";
import { PostgresNodeRepository } from "./postgres_node_repository.ts";

const postgresUrl = Deno.env.get("ANTBOX_TEST_POSTGRES_URL");

Deno.test({
	name: "PostgreSQL persists JSON objects and concurrent audit events across connections",
	ignore: !postgresUrl,
	async fn() {
		const sql = postgres(postgresUrl!);
		const schema = `antbox_test_${crypto.randomUUID().replaceAll("-", "")}`;
		const scopedUrl = new URL(postgresUrl!);
		scopedUrl.searchParams.set("search_path", schema);
		const repositories: Array<{ close(): Promise<void> }> = [];
		try {
			await sql`CREATE SCHEMA ${sql(schema)}`;
			const configuration = (await buildConfiguration(scopedUrl.href))
				.right as PostgresConfigurationRepository;
			const secondConfiguration = (await buildConfiguration(scopedUrl.href))
				.right as PostgresConfigurationRepository;
			repositories.push(configuration, secondConfiguration);
			const group = {
				uuid: "audit_group",
				title: "Audit group",
				createdTime: new Date().toISOString(),
			};
			const groups = Array.from({ length: 10 }, (_, index) => ({
				...group,
				uuid: index === 0 ? group.uuid : `${group.uuid}_${index}`,
			}));
			const saved = await Promise.all(
				groups.map((entry, index) =>
					(index % 2 ? configuration : secondConfiguration).save("groups", entry)
				),
			);
			expect(saved.every((result) => result.isRight())).toBe(true);
			expect((await configuration.get("groups", group.uuid)).right).toEqual(group);
			expect((await configuration.list("groups")).right).toHaveLength(groups.length);

			await sql`CREATE TABLE ${
				sql(`${schema}.nodes`)
			} (uuid TEXT PRIMARY KEY, fid TEXT NOT NULL, title TEXT, parent TEXT, mimetype TEXT, body JSONB NOT NULL, embedding TEXT, embedding_content_md TEXT)`;
			const nodes = new PostgresNodeRepository(scopedUrl.href);
			repositories.push(nodes);
			const node = FileNode.create({
				uuid: "audit_node",
				title: "Original",
				mimetype: "text/plain",
				owner: "tester@antbox.io",
				size: 10,
				properties: { "audit:status": "ready" },
			}).right;
			expect((await nodes.add(node)).isRight()).toBe(true);
			expect((await nodes.getById(node.uuid)).right.title).toBe("Original");
			expect((await nodes.filter([["audit:status", "==", "ready"]])).nodes).toHaveLength(1);
			expect((await nodes.filter([["size", "!=", 10]])).nodes).toHaveLength(0);
			expect((await nodes.filter([["locked", "!=", false]])).nodes).toHaveLength(0);
			expect(
				(await nodes.update(FileNode.create({ ...node.metadata, title: "Updated" }).right))
					.isRight(),
			).toBe(true);
			expect((await nodes.getById(node.uuid)).right.title).toBe("Updated");
			// Exercise the field-only update without requiring pgvector in the test database.
			await sql`UPDATE ${sql(`${schema}.nodes`)} SET embedding = '[1,0]',
				embedding_content_md = 'Retained embedding',
				body = jsonb_set(body, '{modifiedTime}', '"2020-01-01T00:00:00.000Z"'::jsonb)
				WHERE uuid = ${node.uuid}`;
			const beforeTouch = (await nodes.getById(node.uuid)).right.metadata;
			expect((await nodes.touch(node.uuid)).isRight()).toBe(true);
			const afterTouch = (await nodes.getById(node.uuid)).right.metadata;
			expect(afterTouch.modifiedTime).not.toBe(beforeTouch.modifiedTime);
			expect({ ...afterTouch, modifiedTime: beforeTouch.modifiedTime }).toEqual(beforeTouch);
			const embedding = await sql`SELECT embedding, embedding_content_md FROM ${
				sql(`${schema}.nodes`)
			} WHERE uuid = ${node.uuid}`;
			expect(embedding[0]).toEqual({
				embedding: "[1,0]",
				embedding_content_md: "Retained embedding",
			});
			expect((await nodes.touch("missing-node")).isLeft()).toBe(true);
			expect((await nodes.getById("missing-node")).isLeft()).toBe(true);

			const first = (await buildEventStore(scopedUrl.href))
				.right as PostgresEventStoreRepository;
			const second = (await buildEventStore(scopedUrl.href))
				.right as PostgresEventStoreRepository;
			repositories.push(first, second);
			const event = {
				eventType: "NodeUpdated",
				userEmail: "tester@antbox.io",
				occurredOn: new Date().toISOString(),
				payload: { value: "preserved" },
			};
			const appended = await Promise.all(
				Array.from(
					{ length: 20 },
					(_, index) =>
						(index % 2 ? first : second).append("audit_stream", "text/plain", {
							...event,
							payload: { index },
						}),
				),
			);
			expect(appended.filter((result) => result.isLeft()).map((result) => result.value.message))
				.toEqual([]);
			const stream = (await first.getStream("audit_stream", "text/plain")).right;
			expect(stream.map((entry) => entry.sequence)).toEqual(
				Array.from({ length: 20 }, (_, index) => index),
			);
			expect(
				stream.map((entry) => (entry.payload as { index: number }).index).sort((a, b) => a - b),
			).toEqual(Array.from({ length: 20 }, (_, index) => index));
		} finally {
			await Promise.all(repositories.map((repository) => repository.close()));
			await sql`DROP SCHEMA IF EXISTS ${sql(schema)} CASCADE`;
			await sql.end();
		}
	},
});
