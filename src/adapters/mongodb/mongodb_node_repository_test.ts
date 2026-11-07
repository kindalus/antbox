import { it } from "bdd";
import process from "node:process";
import { expect } from "expect";
import { MongoClient, ObjectId } from "mongodb";
import { FileNode } from "domain/nodes/file_node.ts";
import buildMongodbNodeRepository, { MongodbNodeRepository } from "./mongodb_node_repository.ts";

const mongodbUrl = process.env.ANTBOX_TEST_MONGODB_URL;

(mongodbUrl ? it : it.skip)(
	"MongoDB preserves legacy nodes while distinguishing UUIDs with identical suffixes",
	async () => {
		const client = await new MongoClient(mongodbUrl!).connect();
		const databaseName = `antbox_test_${crypto.randomUUID().replaceAll("-", "")}`;
		const database = client.db(databaseName);
		let repository: MongodbNodeRepository | undefined;
		try {
			const original = FileNode.create({
				uuid: "alpha1234",
				title: "Legacy document",
				mimetype: "text/plain",
				owner: "tester@antbox.io",
				aspects: ["safe"],
			}).right;
			await database.collection("nodes").insertOne({
				_id: new ObjectId("313233340000000000000000"),
				...original.metadata,
				// Written by versions before full-text search; kept so a rollback can still search.
				fulltext: "before\0after",
			});
			repository = (await buildMongodbNodeRepository(mongodbUrl!, databaseName))
				.right as MongodbNodeRepository;
			const other =
				FileNode.create({ ...original.metadata, uuid: "beta1234", title: "Other document" })
					.right;
			expect((await repository.add(other)).isRight()).toBe(true);
			expect((await repository.add(original)).isLeft()).toBe(true);
			expect((await repository.getById(original.uuid)).right.title).toBe("Legacy document");
			expect((await repository.getById(other.uuid)).right.title).toBe("Other document");
			expect((await repository.getById("unknown1234")).isLeft()).toBe(true);
			expect((await repository.filter([["$expr", "==", [1, 1]]])).nodes).toHaveLength(0);
			expect((await repository.filter([["title", "==", { $ne: null }]])).nodes).toHaveLength(0);
			expect((await repository.filter([["title", "contains-any", [{ $ne: null }]]])).nodes)
				.toHaveLength(0);
			expect(
				(await repository.filter([["aspects", "contains-all", [{
					$elemMatch: { $eq: "safe" },
				}]]]))
					.nodes,
			).toHaveLength(0);
			expect((await repository.filter([["fulltext", "match", "before"]])).nodes).toHaveLength(0);
			const nul = await repository.fts("before\0after", { pageSize: 10, pageToken: 1 });
			expect(nul.right.nodes).toHaveLength(0);
			expect((await repository.listWithoutSearchContent(10)).right).toEqual([
				"alpha1234",
				"beta1234",
			]);

			await repository.saveContent(original.uuid, { markdown: "legacy content" });
			await repository.upsertEmbedding(original.uuid, [1, 0]);
			await repository.saveContent(other.uuid, { markdown: "other content" });
			await repository.upsertEmbedding(other.uuid, [0, 1]);
			expect((await repository.touch(original.uuid)).isRight()).toBe(true);
			expect((await database.collection("nodes").findOne({ uuid: original.uuid }))?._id)
				.toEqual(new ObjectId("313233340000000000000000"));
			expect((await repository.getContents([original.uuid, other.uuid])).right).toEqual(
				{
					alpha1234: "legacy content",
					beta1234: "other content",
				},
			);
			await repository.update(
				FileNode.create({ ...other.metadata, title: "Updated document" }).right,
			);
			expect((await repository.getById(original.uuid)).right.title).toBe("Legacy document");
			expect((await repository.getById(other.uuid)).right.title).toBe("Updated document");
			await repository.update((await repository.getById(original.uuid)).right);
			const legacy = await database.collection("nodes").findOne({ uuid: original.uuid });
			expect(legacy?.fulltext).toBe("before\0after");
			expect("fulltext" in (await repository.getById(original.uuid)).right.metadata).toBe(false);
			await repository.deleteEmbedding(original.uuid);
			expect((await repository.getContents([original.uuid, other.uuid])).right).toEqual(
				{ alpha1234: "legacy content", beta1234: "other content" },
			);
			await repository.delete(original.uuid);
			expect((await repository.getById(original.uuid)).isLeft()).toBe(true);
			expect((await repository.getById(other.uuid)).isRight()).toBe(true);
		} finally {
			await repository?.close();
			await database.dropDatabase();
			await client.close();
		}
	},
);
