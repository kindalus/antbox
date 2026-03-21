import { assertEquals } from "jsr:@std/assert@0.224.0";
import { InMemoryEventStoreRepository } from "adapters/inmem/inmem_event_store_repository.ts";
import { AuditLoggingService } from "./audit_logging_service.ts";
import { AgentInteractionCompletedEvent } from "domain/ai/agent_interaction_completed_event.ts";
import { EmbeddingsGeneratedEvent } from "domain/ai/embeddings_generated_event.ts";
import type { Event } from "shared/event.ts";
import type { EventBus } from "shared/event_bus.ts";
import type { EventHandler } from "shared/event_handler.ts";

class SynchronousEventBus implements EventBus {
	readonly #handlers: Record<string, EventHandler<Event>[]> = {};

	publish(event: Event): void {
		for (const handler of this.#handlers[event.eventId] ?? []) {
			handler.handle(event);
		}
	}

	subscribe(eventId: string, handler: EventHandler<Event>): void {
		this.#handlers[eventId] ??= [];
		this.#handlers[eventId].push(handler);
	}

	unsubscribe(eventId: string, handler: EventHandler<Event>): void {
		this.#handlers[eventId] = (this.#handlers[eventId] ?? []).filter((h) => h !== handler);
	}
}

Deno.test("AuditLoggingService persists AI usage events", async () => {
	const repository = new InMemoryEventStoreRepository();
	const eventBus = new SynchronousEventBus();
	new AuditLoggingService(repository, eventBus);

	eventBus.publish(
		new AgentInteractionCompletedEvent("user@example.com", "tenant-a", {
			agentUuid: "agent-1",
			interactionType: "chat",
			usage: {
				promptTokens: 10,
				completionTokens: 5,
				totalTokens: 15,
			},
		}),
	);

	eventBus.publish(
		new EmbeddingsGeneratedEvent("system", "tenant-a", {
			nodeUuid: "node-1",
			model: "default",
			context: "indexing",
			usage: {
				promptTokens: 20,
				completionTokens: 0,
				totalTokens: 20,
			},
		}),
	);

	const agentEventsOrErr = await repository.getStream(
		"agent-1",
		"application/vnd.antbox.agent-usage",
	);
	const embeddingEventsOrErr = await repository.getStream(
		"node-1",
		"application/vnd.antbox.embeddings-usage",
	);

	if (agentEventsOrErr.isLeft()) {
		throw agentEventsOrErr.value;
	}
	if (embeddingEventsOrErr.isLeft()) {
		throw embeddingEventsOrErr.value;
	}

	assertEquals(agentEventsOrErr.value.length, 1);
	assertEquals(agentEventsOrErr.value[0].eventType, AgentInteractionCompletedEvent.EVENT_ID);
	assertEquals(
		agentEventsOrErr.value[0].payload,
		{
			agentUuid: "agent-1",
			interactionType: "chat",
			usage: {
				promptTokens: 10,
				completionTokens: 5,
				totalTokens: 15,
			},
		},
	);

	assertEquals(embeddingEventsOrErr.value.length, 1);
	assertEquals(embeddingEventsOrErr.value[0].eventType, EmbeddingsGeneratedEvent.EVENT_ID);
	assertEquals(
		embeddingEventsOrErr.value[0].payload,
		{
			nodeUuid: "node-1",
			model: "default",
			context: "indexing",
			usage: {
				promptTokens: 20,
				completionTokens: 0,
				totalTokens: 20,
			},
		},
	);
});
