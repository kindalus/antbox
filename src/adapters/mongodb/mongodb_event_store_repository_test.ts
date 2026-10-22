import { expect } from "expect";
import { MongoClient } from "mongodb";
import { MongodbEventStoreRepository } from "./mongodb_event_store_repository.ts";

const mongodbUrl = Deno.env.get("ANTBOX_TEST_MONGODB_URL");

Deno.test({
	name: "MongoDB audit streams retain concurrent appends across repository instances",
	ignore: !mongodbUrl,
	async fn() {
		const client = await new MongoClient(mongodbUrl!).connect();
		const databaseName = `antbox_test_${crypto.randomUUID().replaceAll("-", "")}`;
		const database = client.db(databaseName);
		try {
			const first = new MongodbEventStoreRepository(client, databaseName);
			const second = new MongodbEventStoreRepository(client, databaseName);
			const results = await Promise.all(
				Array.from(
					{ length: 20 },
					(_, index) =>
						(index % 2 ? first : second).append("concurrent_stream", "text/plain", {
							eventType: "NodeUpdated",
							userEmail: "tester@antbox.io",
							occurredOn: new Date().toISOString(),
							payload: { index },
						}),
				),
			);
			expect(results.filter((result) => result.isLeft())).toEqual([]);
			const stream = (await first.getStream("concurrent_stream", "text/plain")).right;
			expect(stream.map((event) => event.sequence)).toEqual(
				Array.from({ length: 20 }, (_, index) => index),
			);
			expect(
				stream.map((event) => (event.payload as { index: number }).index).sort((a, b) => a - b),
			).toEqual(Array.from({ length: 20 }, (_, index) => index));
		} finally {
			await database.dropDatabase();
			await client.close();
		}
	},
});
