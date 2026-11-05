import { it } from "bdd";
import process from "node:process";
import { expect } from "expect";
import { MongoClient } from "mongodb";
import { MongodbConfigurationRepository } from "./mongodb_configuration_repository.ts";

const mongodbUrl = process.env.ANTBOX_TEST_MONGODB_URL;

(mongodbUrl ? it : it.skip)(
	"MongoDB configuration saves replace the full object state",
	async () => {
		const client = await new MongoClient(mongodbUrl!).connect();
		const databaseName = `antbox_test_${crypto.randomUUID().replaceAll("-", "")}`;
		try {
			const repository = new MongodbConfigurationRepository(client, databaseName);
			const group = {
				uuid: "audit-group",
				title: "Audit group",
				createdTime: new Date().toISOString(),
			};
			expect(
				(await repository.save("groups", { ...group, description: "Remove this" })).isRight(),
			)
				.toBe(true);
			expect((await repository.save("groups", group)).isRight()).toBe(true);
			expect((await repository.get("groups", group.uuid)).right).toEqual(group);
			expect((await repository.list("groups")).right).toEqual([group]);
		} finally {
			await client.db(databaseName).dropDatabase();
			await client.close();
		}
	},
);
