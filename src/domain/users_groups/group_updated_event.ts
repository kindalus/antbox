import { type Event } from "shared/event.ts";

export class GroupUpdatedEvent implements Event {
	static EVENT_ID = "GroupUpdatedEvent";

	readonly eventId: string;
	readonly occurredOn: Date;
	readonly payload: Record<string, unknown>;

	constructor(
		readonly userEmail: string,
		readonly tenant: string,
		uuid: string,
		title?: string,
	) {
		this.eventId = GroupUpdatedEvent.EVENT_ID;
		this.occurredOn = new Date();
		this.payload = {
			uuid,
			title,
		};
	}
}
