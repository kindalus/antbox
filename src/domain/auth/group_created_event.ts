import Event from "/shared/event.ts";

export default class GroupCreatedEvent implements Event {
	static EVENT_ID = "GroupCreatedEvent";

	readonly eventId: string;
	readonly occurredOn: Date;
	readonly payload: Record<string, unknown>;

	constructor(
		groupId: string,
		name: string,
	) {
		this.eventId = GroupCreatedEvent.EVENT_ID;
		this.occurredOn = new Date();
		this.payload = {
			groupId,
			name,
		};
	}
}
