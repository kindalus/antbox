import { assertEquals } from "jsr:@std/assert@0.224.0";
import { InMemoryEventStoreRepository } from "adapters/inmem/inmem_event_store_repository.ts";
import { AuditLoggingService } from "./audit_logging_service.ts";
import { AgentInteractionCompletedEvent } from "domain/ai/agent_interaction_completed_event.ts";
import { EmbeddingsGeneratedEvent } from "domain/ai/embeddings_generated_event.ts";
import type { Event } from "shared/event.ts";
import type { EventBus } from "shared/event_bus.ts";
import type { EventHandler } from "shared/event_handler.ts";
import buildFlatFileEventStoreRepository from "adapters/flat_file/flat_file_event_store_repository.ts";
import { InMemoryConfigurationRepository } from "adapters/inmem/inmem_configuration_repository.ts";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository.ts";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider.ts";
import { NodeService } from "application/nodes/node_service.ts";
import type { AuthenticationContext } from "application/security/authentication_context.ts";
import { NodeCreatedEvent } from "domain/nodes/node_created_event.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { Groups } from "domain/users_groups/groups.ts";
import { Users } from "domain/users_groups/users.ts";

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

Deno.test("created file audit records retain public metadata", async (t) => {
	for (const kind of ["memory", "flat-file"] as const) {
		await t.step(kind, async () => {
			const directory = kind === "flat-file" ? await Deno.makeTempDir() : undefined;
			try {
				const repository = directory
					? (await buildFlatFileEventStoreRepository(directory)).right
					: new InMemoryEventStoreRepository();
				const eventBus = new SynchronousEventBus();
				const audit = new AuditLoggingService(repository, eventBus);
				const service = new NodeService({
					repository: new InMemoryNodeRepository(),
					storage: new InMemoryStorageProvider(),
					configRepo: new InMemoryConfigurationRepository(),
					bus: eventBus,
				});
				const ctx: AuthenticationContext = {
					tenant: "test",
					mode: "Direct",
					principal: { email: Users.ROOT_USER_EMAIL, groups: [Groups.ADMINS_GROUP_UUID] },
				};
				const parent = await service.create(ctx, {
					uuid: "audit-parent",
					title: "Audit parent",
					parent: Nodes.ROOT_FOLDER_UUID,
					mimetype: Nodes.FOLDER_MIMETYPE,
					filters: [],
				});
				if (parent.isLeft()) throw parent.value;
				const created = await service.createFile(
					ctx,
					new File(["Résumé"], "report.txt", { type: "text/plain" }),
					{
						uuid: "audit-created-file",
						parent: parent.value.uuid,
						description: "A file with public audit metadata",
						tags: ["audit"],
					},
				);
				if (created.isLeft()) throw created.value;
				const expected = JSON.parse(JSON.stringify(created.value));
				const events = await audit.get(ctx, created.value.uuid, created.value.mimetype);
				if (events.isLeft()) throw events.value;
				assertEquals(events.value.length, 1);
				assertEquals(events.value[0].eventType, NodeCreatedEvent.EVENT_ID);
				assertEquals(events.value[0].userEmail, ctx.principal.email);
				assertEquals(JSON.parse(JSON.stringify(events.value[0].payload)), expected);

				if (directory) {
					const reloaded = await buildFlatFileEventStoreRepository(directory);
					if (reloaded.isLeft()) throw reloaded.value;
					const persisted = await reloaded.value.getStream(created.value.uuid, "text/plain");
					if (persisted.isLeft()) throw persisted.value;
					assertEquals(persisted.value[0].payload, expected);
				}
			} finally {
				if (directory) await Deno.remove(directory, { recursive: true });
			}
		});
	}
});
