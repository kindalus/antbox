import { Event } from "../../shared/event.ts";

export class UserDeletedEvent implements Event {
	static EVENT_ID = "UserDeletedEvent";

	readonly eventId: string;
	readonly occurredOn: Date;
	readonly payload: Record<string, unknown>;

	constructor(readonly userEmail: string, uuid: string) {
		this.eventId = UserDeletedEvent.EVENT_ID;
		this.occurredOn = new Date();
		this.payload = {
			uuid,
		};
	}
}
