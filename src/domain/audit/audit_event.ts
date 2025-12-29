export interface AuditEvent {
	streamId: string;
	eventType: string;
	occurredOn: string;
	userEmail: string;
	payload: unknown;
	sequence: number;
}

export interface AuditEventDTO {
	streamId: string;
	eventType: string;
	occurredOn: string;
	userEmail: string;
	payload: unknown;
	sequence: number;
}

export function toAuditEventDTO(event: AuditEvent): AuditEventDTO {
	return {
		streamId: event.streamId,
		eventType: event.eventType,
		occurredOn: event.occurredOn,
		userEmail: event.userEmail,
		payload: event.payload,
		sequence: event.sequence,
	};
}
