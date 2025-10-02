import { type Event } from "shared/event.ts";

export class UserCreatedEvent implements Event {
	static EVENT_ID = "UserCreatedEvent";

	readonly eventId: string;
	readonly occurredOn: Date;
	readonly payload: Record<string, unknown>;

	constructor(
		readonly userEmail: string,
		email: string,
		fullname: string,
	) {
		this.eventId = UserCreatedEvent.EVENT_ID;
		this.occurredOn = new Date();
		this.payload = {
			email,
			fullname,
		};
	}
}
