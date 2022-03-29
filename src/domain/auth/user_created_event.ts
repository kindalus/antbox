import Event from "../../shared/event.ts";

export default class UserCreatedEvent implements Event {
	static EVENT_ID = "UserCreatedEvent";

	readonly eventId: string;
	readonly occurredOn: Date;
	readonly payload: Record<string, unknown>;

	constructor(
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
