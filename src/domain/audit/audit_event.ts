export interface AuditEvent {
	streamId: string;
	eventId: string;
	eventType: string;
	occurredOn: string;
	userEmail: string;
	tenant: string;
	payload: unknown;
	sequence: number;
}

export interface AuditEventDTO {
	streamId: string;
	eventId: string;
	eventType: string;
	occurredOn: string;
	userEmail: string;
	tenant: string;
	payload: unknown;
	sequence: number;
}

export function toAuditEventDTO(event: AuditEvent): AuditEventDTO {
	return {
		streamId: event.streamId,
		eventId: event.eventId,
		eventType: event.eventType,
		occurredOn: event.occurredOn,
		userEmail: event.userEmail,
		tenant: event.tenant,
		payload: event.payload,
		sequence: event.sequence,
	};
}
