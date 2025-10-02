import { type Event } from "shared/event.ts";
import { Node } from "./node.ts";

export class NodeUpdatedEvent implements Event {
	static EVENT_ID = "NodeUpdatedEvent";

	readonly eventId: string;
	readonly occurredOn: Date;
	readonly payload: { uuid: string } & Partial<Node>;

	constructor(
		readonly userEmail: string,
		uuid: string,
		data: Partial<Node>,
	) {
		this.eventId = NodeUpdatedEvent.EVENT_ID;
		this.occurredOn = new Date();
		this.payload = { uuid, ...data };
	}
}
