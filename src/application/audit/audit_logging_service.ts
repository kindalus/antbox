import { Logger } from "shared/logger.ts";
import { type AuditEventDTO, toAuditEventDTO } from "domain/audit/audit_event.ts";
import type { EventStoreRepository } from "domain/audit/event_store_repository.ts";
import { NodeCreatedEvent } from "domain/nodes/node_created_event.ts";
import { NodeDeletedEvent } from "domain/nodes/node_deleted_event.ts";
import type { NodeMetadata } from "domain/nodes/node_metadata.ts";
import { NodeUpdatedEvent } from "domain/nodes/node_updated_event.ts";
import { AgentInteractionCompletedEvent } from "domain/ai/agent_interaction_completed_event.ts";
import { EmbeddingsGeneratedEvent } from "domain/ai/embeddings_generated_event.ts";
import { OcrCompletedEvent } from "domain/ai/ocr_completed_event.ts";
import { Groups } from "domain/users_groups/groups.ts";
import { type AntboxError, ForbiddenError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import type { EventBus } from "shared/event_bus.ts";
import { eventHandlerFunc } from "shared/event_handler.ts";
import type { AuthenticationContext } from "../security/authentication_context.ts";

/** Updates used to be recorded here regardless of the node's mimetype. */
const LEGACY_UPDATES_MIMETYPE = "application/octet-stream";

export interface DeletedNodeInfo {
	uuid: string;
	title: string;
	deletedAt: string;
	deletedBy: string;
}

export class AuditLoggingService {
	constructor(
		private readonly repository: EventStoreRepository,
		private readonly eventBus: EventBus,
	) {
		this.#subscribeToEvents();
	}

	#subscribeToEvents(): void {
		this.eventBus.subscribe(
			NodeCreatedEvent.EVENT_ID,
			eventHandlerFunc((e: NodeCreatedEvent) => this.#handleNodeCreated(e)),
		);

		this.eventBus.subscribe(
			NodeUpdatedEvent.EVENT_ID,
			eventHandlerFunc((e: NodeUpdatedEvent) => this.#handleNodeUpdated(e)),
		);

		this.eventBus.subscribe(
			NodeDeletedEvent.EVENT_ID,
			eventHandlerFunc((e: NodeDeletedEvent) => this.#handleNodeDeleted(e)),
		);

		this.eventBus.subscribe(
			AgentInteractionCompletedEvent.EVENT_ID,
			eventHandlerFunc((e: AgentInteractionCompletedEvent) => this.#handleAgentInteraction(e)),
		);

		this.eventBus.subscribe(
			EmbeddingsGeneratedEvent.EVENT_ID,
			eventHandlerFunc((e: EmbeddingsGeneratedEvent) => this.#handleEmbeddingsGenerated(e)),
		);

		this.eventBus.subscribe(
			OcrCompletedEvent.EVENT_ID,
			eventHandlerFunc((e: OcrCompletedEvent) => this.#handleOcrCompleted(e)),
		);
	}

	#handleAgentInteraction(event: AgentInteractionCompletedEvent): void {
		this.#appendToRepository(event.payload.agentUuid, "application/vnd.antbox.agent-usage", {
			eventType: AgentInteractionCompletedEvent.EVENT_ID,
			occurredOn: event.occurredOn.toISOString(),
			userEmail: event.userEmail,
			payload: event.payload,
		});
	}

	#handleEmbeddingsGenerated(event: EmbeddingsGeneratedEvent): void {
		this.#appendToRepository(event.payload.nodeUuid, "application/vnd.antbox.embeddings-usage", {
			eventType: EmbeddingsGeneratedEvent.EVENT_ID,
			occurredOn: event.occurredOn.toISOString(),
			userEmail: event.userEmail,
			payload: event.payload,
		});
	}

	#handleOcrCompleted(event: OcrCompletedEvent): void {
		this.#appendToRepository(event.payload.nodeUuid, "application/vnd.antbox.ocr-usage", {
			eventType: OcrCompletedEvent.EVENT_ID,
			occurredOn: event.occurredOn.toISOString(),
			userEmail: event.userEmail,
			payload: event.payload,
		});
	}

	#handleNodeCreated(event: NodeCreatedEvent): void {
		const node = event.payload;

		this.#appendToRepository(node.uuid, node.mimetype, {
			eventType: NodeCreatedEvent.EVENT_ID,
			occurredOn: event.occurredOn.toISOString(),
			userEmail: event.userEmail,
			payload: event.payload,
		});
	}

	#handleNodeUpdated(event: NodeUpdatedEvent): void {
		const changes = event.payload;

		this.#appendToRepository(changes.uuid, changes.mimetype, {
			eventType: NodeUpdatedEvent.EVENT_ID,
			occurredOn: event.occurredOn.toISOString(),
			userEmail: event.userEmail,
			payload: event.payload,
		});
	}

	#handleNodeDeleted(event: NodeDeletedEvent): void {
		const node = event.payload;

		this.#appendToRepository(node.uuid, node.mimetype, {
			eventType: NodeDeletedEvent.EVENT_ID,
			occurredOn: event.occurredOn.toISOString(),
			userEmail: event.userEmail,
			payload: event.payload,
		});
	}

	#appendToRepository(
		streamId: string,
		mimetype: string,
		event: Omit<AuditEventDTO, "streamId" | "sequence">,
	): void {
		this.repository.append(streamId, mimetype, event).then((result) => {
			if (result.isLeft()) {
				Logger.error(`Error appending ${event.eventType} to audit log:`, result.value);
			}
		}).catch((err) => {
			Logger.error(`Error appending ${event.eventType} to audit log:`, err);
		});
	}

	#isAdmin(ctx: AuthenticationContext): boolean {
		return ctx.principal.groups?.includes(Groups.ADMINS_GROUP_UUID) ?? false;
	}

	async get(
		ctx: AuthenticationContext,
		uuid: string,
		mimetype: string,
	): Promise<Either<AntboxError, AuditEventDTO[]>> {
		if (!this.#isAdmin(ctx)) {
			return left(new ForbiddenError());
		}

		const streamOrErr = await this.repository.getStream(uuid, mimetype);

		if (streamOrErr.isLeft()) {
			return left(streamOrErr.value);
		}

		if (mimetype === LEGACY_UPDATES_MIMETYPE) {
			return right(streamOrErr.value.map(toAuditEventDTO));
		}

		const legacyOrErr = await this.repository.getStream(uuid, LEGACY_UPDATES_MIMETYPE);
		if (legacyOrErr.isLeft()) {
			return left(legacyOrErr.value);
		}

		const events = [...streamOrErr.value, ...legacyOrErr.value].sort((a, b) =>
			Date.parse(a.occurredOn) - Date.parse(b.occurredOn)
		);

		return right(events.map(toAuditEventDTO));
	}

	async getDeleted(
		ctx: AuthenticationContext,
		mimetype: string,
	): Promise<Either<AntboxError, DeletedNodeInfo[]>> {
		if (!this.#isAdmin(ctx)) {
			return left(new ForbiddenError());
		}

		const streamsOrErr = await this.repository.getStreamsByMimetype(mimetype);

		if (streamsOrErr.isLeft()) {
			return left(streamsOrErr.value);
		}

		const streams = streamsOrErr.value;
		const deletedNodes: DeletedNodeInfo[] = [];

		for (const [streamId, events] of streams.entries()) {
			const hasDeleteEvent = events.some((e) => e.eventType === NodeDeletedEvent.EVENT_ID);

			if (hasDeleteEvent) {
				const createdEvent = events.find((e) => e.eventType === NodeCreatedEvent.EVENT_ID);
				const deletedEvent = events.find((e) => e.eventType === NodeDeletedEvent.EVENT_ID);

				if (deletedEvent) {
					const title = createdEvent
						? (createdEvent.payload as NodeMetadata).title
						: "Unknown";

					deletedNodes.push({
						uuid: streamId,
						title,
						deletedAt: deletedEvent.occurredOn,
						deletedBy: deletedEvent.userEmail,
					});
				}
			}
		}

		return right(deletedNodes.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt)));
	}
}
