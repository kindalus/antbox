import { type Event } from "shared/event.ts";

export class UserUpdatedEvent implements Event {
	static EVENT_ID = "UserUpdatedEvent";

	readonly eventId: string;
	readonly occurredOn: Date;
	readonly payload: Record<string, unknown>;

	constructor(
		readonly userEmail: string,
		readonly tenant: string,
		readonly uuid: string,
		email?: string,
		fullname?: string,
	) {
		this.eventId = UserUpdatedEvent.EVENT_ID;
		this.occurredOn = new Date();
		this.payload = {
			email,
			fullname,
		};
	}
}
