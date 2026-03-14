import { Event } from "shared/event.ts";

export class EmbeddingUpdatedEvent implements Event {
	static EVENT_ID = "EmbeddingUpdatedEvent";

	readonly eventId: string;
	readonly occurredOn: Date;
	readonly payload: { uuid: string };
	readonly tenant: string;

	constructor(
		readonly userEmail: string,
		tenant: string,
		uuid: string,
	) {
		this.eventId = EmbeddingUpdatedEvent.EVENT_ID;
		this.occurredOn = new Date();
		this.tenant = tenant;
		this.payload = { uuid };
	}
}
