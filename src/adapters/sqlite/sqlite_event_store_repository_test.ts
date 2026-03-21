import { assertEquals } from "jsr:@std/assert@0.224.0";
import { SqliteEventStoreRepository } from "./sqlite_event_store_repository.ts";

Deno.test("SqliteEventStoreRepository stores usage events for dotted mimetypes", async () => {
	const repository = new SqliteEventStoreRepository();

	const agentAppendOrErr = await repository.append(
		"agent-1",
		"application/vnd.antbox.agent-usage",
		{
			eventType: "AgentInteractionCompletedEvent",
			occurredOn: "2026-03-21T12:00:00.000Z",
			userEmail: "user@example.com",
			payload: {
				agentUuid: "agent-1",
				usage: {
					promptTokens: 10,
					completionTokens: 5,
					totalTokens: 15,
				},
				interactionType: "chat",
			},
		},
	);
	const embeddingAppendOrErr = await repository.append(
		"node-1",
		"application/vnd.antbox.embeddings-usage",
		{
			eventType: "EmbeddingsGeneratedEvent",
			occurredOn: "2026-03-21T12:01:00.000Z",
			userEmail: "system",
			payload: {
				nodeUuid: "node-1",
				model: "default",
				context: "indexing",
				usage: {
					promptTokens: 20,
					completionTokens: 0,
					totalTokens: 20,
				},
			},
		},
	);

	if (agentAppendOrErr.isLeft()) {
		throw agentAppendOrErr.value;
	}
	if (embeddingAppendOrErr.isLeft()) {
		throw embeddingAppendOrErr.value;
	}

	const agentStreamOrErr = await repository.getStream(
		"agent-1",
		"application/vnd.antbox.agent-usage",
	);
	const embeddingStreamOrErr = await repository.getStream(
		"node-1",
		"application/vnd.antbox.embeddings-usage",
	);

	if (agentStreamOrErr.isLeft()) {
		throw agentStreamOrErr.value;
	}
	if (embeddingStreamOrErr.isLeft()) {
		throw embeddingStreamOrErr.value;
	}

	assertEquals(agentStreamOrErr.value.length, 1);
	assertEquals(agentStreamOrErr.value[0].eventType, "AgentInteractionCompletedEvent");
	assertEquals(embeddingStreamOrErr.value.length, 1);
	assertEquals(embeddingStreamOrErr.value[0].eventType, "EmbeddingsGeneratedEvent");

	repository.close();
});
