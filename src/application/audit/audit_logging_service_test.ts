import { join } from "node:path";
import { tmpdir } from "node:os";
import fs from "node:fs/promises";
import { expect } from "expect";
import { describe, it } from "bdd";
import { InMemoryEventStoreRepository } from "adapters/inmem/inmem_event_store_repository.ts";
import { AuditLoggingService } from "./audit_logging_service.ts";
import { AgentInteractionCompletedEvent } from "domain/ai/agent_interaction_completed_event.ts";
import { EmbeddingsGeneratedEvent } from "domain/ai/embeddings_generated_event.ts";
import { OcrCompletedEvent } from "domain/ai/ocr_completed_event.ts";
import type { Event } from "shared/event.ts";
import type { EventBus } from "shared/event_bus.ts";
import type { EventHandler } from "shared/event_handler.ts";
import { InMemoryConfigurationRepository } from "adapters/inmem/inmem_configuration_repository.ts";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository.ts";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider.ts";
import buildSqliteEventStoreRepository from "adapters/sqlite/sqlite_event_store_repository.ts";
import { NodeService } from "application/nodes/node_service.ts";
import type { AuthenticationContext } from "application/security/authentication_context.ts";
import { NodeCreatedEvent } from "domain/nodes/node_created_event.ts";
import { NodeUpdatedEvent } from "domain/nodes/node_updated_event.ts";
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

it("AuditLoggingService persists AI usage events", async () => {
	const repository = new InMemoryEventStoreRepository();
	const eventBus = new SynchronousEventBus();
	new AuditLoggingService(repository, eventBus);

	eventBus.publish(
		new AgentInteractionCompletedEvent("user@example.com", "tenant-a", {
			agentUuid: "agent-1",
			model: "google/gemini-2.5-flash",
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

	expect(agentEventsOrErr.value.length).toEqual(1);
	expect(agentEventsOrErr.value[0].eventType).toEqual(AgentInteractionCompletedEvent.EVENT_ID);
	expect(
		agentEventsOrErr.value[0].payload,
	).toEqual({
		agentUuid: "agent-1",
		model: "google/gemini-2.5-flash",
		interactionType: "chat",
		usage: {
			promptTokens: 10,
			completionTokens: 5,
			totalTokens: 15,
		},
	});

	expect(embeddingEventsOrErr.value.length).toEqual(1);
	expect(embeddingEventsOrErr.value[0].eventType).toEqual(EmbeddingsGeneratedEvent.EVENT_ID);
	expect(
		embeddingEventsOrErr.value[0].payload,
	).toEqual({
		nodeUuid: "node-1",
		model: "default",
		context: "indexing",
		usage: {
			promptTokens: 20,
			completionTokens: 0,
			totalTokens: 20,
		},
	});
});

function adminContext(): AuthenticationContext {
	return {
		tenant: "test",
		mode: "Direct",
		principal: { email: Users.ROOT_USER_EMAIL, groups: [Groups.ADMINS_GROUP_UUID] },
	};
}

function storedEvent(eventType: string, occurredOn: string) {
	return { eventType, occurredOn, userEmail: "user@example.com", payload: { occurredOn } };
}

it("node updates are audited in the node's own mimetype stream", async () => {
	const repository = new InMemoryEventStoreRepository();
	const eventBus = new SynchronousEventBus();
	const audit = new AuditLoggingService(repository, eventBus);
	const service = new NodeService({
		repository: new InMemoryNodeRepository(),
		storage: new InMemoryStorageProvider(),
		configRepo: new InMemoryConfigurationRepository(),
		bus: eventBus,
	});
	const ctx = adminContext();
	const parent = await service.create(ctx, {
		uuid: "audit-update-parent",
		title: "Parent",
		parent: Nodes.ROOT_FOLDER_UUID,
		mimetype: Nodes.FOLDER_MIMETYPE,
	});
	if (parent.isLeft()) throw parent.value;
	const created = await service.createFile(
		ctx,
		new File(["%PDF-1.7"], "report.pdf", { type: "application/pdf" }),
		{ uuid: "audit-updated-pdf", parent: parent.value.uuid },
	);
	if (created.isLeft()) throw created.value;

	const updated = await service.update(ctx, created.value.uuid, { title: "Renamed" });
	if (updated.isLeft()) throw updated.value;
	await new Promise((resolve) => setTimeout(resolve, 0));

	const events = await audit.get(ctx, created.value.uuid, "application/pdf");
	if (events.isLeft()) throw events.value;
	expect(events.value.map((event) => event.eventType)).toEqual([
		NodeCreatedEvent.EVENT_ID,
		NodeUpdatedEvent.EVENT_ID,
	]);
	const legacy = await repository.getStream(created.value.uuid, "application/octet-stream");
	if (legacy.isLeft()) throw legacy.value;
	expect(legacy.value).toEqual([]);
});

it("audit log merges updates recorded in the legacy octet-stream stream", async () => {
	const repository = new InMemoryEventStoreRepository();
	const audit = new AuditLoggingService(repository, new SynchronousEventBus());
	const legacy = "application/octet-stream";
	await repository.append("pdf", "application/pdf", storedEvent("A", "2026-01-01T10:00:00.000Z"));
	await repository.append("pdf", "application/pdf", storedEvent("C", "2026-01-03T10:00:00.000Z"));
	await repository.append("pdf", legacy, storedEvent("B", "2026-01-02T10:00:00.000Z"));
	await repository.append("pdf", legacy, storedEvent("D", "2026-01-04T10:00:00.000Z"));
	await repository.append("other", legacy, storedEvent("X", "2026-01-02T11:00:00.000Z"));

	const events = await audit.get(adminContext(), "pdf", "application/pdf");

	if (events.isLeft()) throw events.value;
	expect(events.value.map((event) => event.eventType)).toEqual(["A", "B", "C", "D"]);
	expect(events.value.every((event) => event.streamId === "pdf")).toEqual(true);
});

it("audit log does not duplicate events of octet-stream nodes", async () => {
	const repository = new InMemoryEventStoreRepository();
	const audit = new AuditLoggingService(repository, new SynchronousEventBus());
	const legacy = "application/octet-stream";
	await repository.append("bin", legacy, storedEvent("A", "2026-01-01T10:00:00.000Z"));

	const events = await audit.get(adminContext(), "bin", legacy);

	if (events.isLeft()) throw events.value;
	expect(events.value.map((event) => event.eventType)).toEqual(["A"]);
});

it("AuditLoggingService persists OCR usage events", async () => {
	const repository = new InMemoryEventStoreRepository();
	const eventBus = new SynchronousEventBus();
	new AuditLoggingService(repository, eventBus);
	const payload = {
		nodeUuid: "node-1",
		model: "gemini-flash-latest",
		context: "indexing" as const,
		usage: { promptTokens: 30, completionTokens: 12, totalTokens: 42 },
	};

	eventBus.publish(new OcrCompletedEvent("system", "tenant-a", payload));
	await Promise.resolve();

	const eventsOrErr = await repository.getStream("node-1", "application/vnd.antbox.ocr-usage");
	if (eventsOrErr.isLeft()) throw eventsOrErr.value;
	expect(eventsOrErr.value.length).toEqual(1);
	expect(eventsOrErr.value[0].eventType).toEqual(OcrCompletedEvent.EVENT_ID);
	expect(eventsOrErr.value[0].payload).toEqual(payload);
});

describe("created file audit records retain public metadata", () => {
	for (const kind of ["memory", "sqlite"] as const) {
		it(kind, async () => {
			const directory = kind === "sqlite"
				? await fs.mkdtemp(join(tmpdir(), "antbox-audit-test-"))
				: undefined;
			try {
				const repository = directory
					? (await buildSqliteEventStoreRepository(directory)).right
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
				expect(events.value.length).toEqual(1);
				expect(events.value[0].eventType).toEqual(NodeCreatedEvent.EVENT_ID);
				expect(events.value[0].userEmail).toEqual(ctx.principal.email);
				expect(JSON.parse(JSON.stringify(events.value[0].payload))).toEqual(expected);

				if (directory) {
					const reloaded = await buildSqliteEventStoreRepository(directory);
					if (reloaded.isLeft()) throw reloaded.value;
					const persisted = await reloaded.value.getStream(created.value.uuid, "text/plain");
					if (persisted.isLeft()) throw persisted.value;
					expect(persisted.value[0].payload).toEqual(expected);
				}
			} finally {
				if (directory) await fs.rm(directory, { recursive: true });
			}
		});
	}
});
