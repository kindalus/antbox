import type { EventStoreRepository } from "domain/audit/event_store_repository.ts";
import type { AuditEvent, AuditEventDTO } from "domain/audit/audit_event.ts";
import type { EventBus } from "shared/event_bus.ts";
import type { Event } from "shared/event.ts";
import { NodeCreatedEvent } from "domain/nodes/node_created_event.ts";
import { NodeUpdatedEvent } from "domain/nodes/node_updated_event.ts";
import { NodeDeletedEvent } from "domain/nodes/node_deleted_event.ts";
import type { NodeMetadata } from "domain/nodes/node_metadata.ts";
import type { AuthenticationContext } from "./authentication_context.ts";
import { Groups } from "domain/users_groups/groups.ts";
import { type Either, left, right } from "shared/either.ts";
import { type AntboxError, ForbiddenError } from "shared/antbox_error.ts";

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
			(event: Event) => this.#handleNodeCreated(event as NodeCreatedEvent),
		);

		this.eventBus.subscribe(
			NodeUpdatedEvent.EVENT_ID,
			(event: Event) => this.#handleNodeUpdated(event as NodeUpdatedEvent),
		);

		this.eventBus.subscribe(
			NodeDeletedEvent.EVENT_ID,
			(event: Event) => this.#handleNodeDeleted(event as NodeDeletedEvent),
		);
	}

	#handleNodeCreated(event: NodeCreatedEvent): void {
		const node = event.payload;

		this.repository.append(node.uuid, node.mimetype, {
			eventId: crypto.randomUUID(),
			eventType: NodeCreatedEvent.EVENT_ID,
			occurredOn: event.occurredOn.toISOString(),
			userEmail: event.userEmail,
			tenant: event.tenant,
			payload: event.payload,
			sequence: 0,
		}).catch((err) => {
			console.error("Error appending NodeCreatedEvent to audit log:", err);
		});
	}

	#handleNodeUpdated(event: NodeUpdatedEvent): void {
		const changes = event.payload;

		this.repository.append(changes.uuid, this.#getMimetypeFromChanges(changes), {
			eventId: crypto.randomUUID(),
			eventType: NodeUpdatedEvent.EVENT_ID,
			occurredOn: event.occurredOn.toISOString(),
			userEmail: event.userEmail,
			tenant: event.tenant,
			payload: event.payload,
			sequence: 0,
		}).catch((err) => {
			console.error("Error appending NodeUpdatedEvent to audit log:", err);
		});
	}

	#handleNodeDeleted(event: NodeDeletedEvent): void {
		const node = event.payload;

		this.repository.append(node.uuid, node.mimetype, {
			eventId: crypto.randomUUID(),
			eventType: NodeDeletedEvent.EVENT_ID,
			occurredOn: event.occurredOn.toISOString(),
			userEmail: event.userEmail,
			tenant: event.tenant,
			payload: event.payload,
			sequence: 0,
		}).catch((err) => {
			console.error("Error appending NodeDeletedEvent to audit log:", err);
		});
	}

	#getMimetypeFromChanges(
		changes: { oldValues: Partial<NodeMetadata>; newValues: Partial<NodeMetadata> },
	): string {
		return changes.newValues.mimetype || changes.oldValues.mimetype || "application/octet-stream";
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
			return left(new ForbiddenError("Only administrators can access audit logs"));
		}

		const streamOrErr = await this.repository.getStream(uuid, mimetype);

		if (streamOrErr.isLeft()) {
			return left(streamOrErr.value);
		}

		const events = streamOrErr.value.map((event) => ({
			streamId: event.streamId,
			eventId: event.eventId,
			eventType: event.eventType,
			occurredOn: event.occurredOn,
			userEmail: event.userEmail,
			tenant: event.tenant,
			payload: event.payload,
			sequence: event.sequence,
		}));

		return right(events);
	}

	async getDeleted(
		ctx: AuthenticationContext,
		mimetype: string,
	): Promise<Either<AntboxError, DeletedNodeInfo[]>> {
		if (!this.#isAdmin(ctx)) {
			return left(new ForbiddenError("Only administrators can access audit logs"));
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
