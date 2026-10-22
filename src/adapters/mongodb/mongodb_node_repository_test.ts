import { expect } from "expect";
import { MongoClient, ObjectId } from "mongodb";
import { FileNode } from "domain/nodes/file_node.ts";
import buildMongodbNodeRepository, { MongodbNodeRepository } from "./mongodb_node_repository.ts";

const mongodbUrl = Deno.env.get("ANTBOX_TEST_MONGODB_URL");

Deno.test({
	name: "MongoDB preserves legacy nodes while distinguishing UUIDs with identical suffixes",
	ignore: !mongodbUrl,
	async fn() {
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
				fulltext: "before\0after",
			}).right;
			await database.collection("nodes").insertOne({
				_id: new ObjectId("313233340000000000000000"),
				...original.metadata,
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
			expect((await repository.filter([["fulltext", "match", "before\0after"]])).nodes)
				.toHaveLength(2);

			await repository.upsertEmbedding(original.uuid, [1, 0], "legacy content");
			await repository.upsertEmbedding(other.uuid, [0, 1], "other content");
			expect((await repository.touch(original.uuid)).isRight()).toBe(true);
			expect((await database.collection("nodes").findOne({ uuid: original.uuid }))?._id)
				.toEqual(new ObjectId("313233340000000000000000"));
			expect((await repository.getEmbeddingContents([original.uuid, other.uuid])).right).toEqual(
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
			await repository.deleteEmbedding(original.uuid);
			expect((await repository.getEmbeddingContents([original.uuid, other.uuid])).right).toEqual(
				{ beta1234: "other content" },
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
});
