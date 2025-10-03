import { type Event } from "shared/event.ts";
import { NodeLike } from "domain/node_like.ts";

export class NodeDeletedEvent implements Event {
	static EVENT_ID = "NodeDeletedEvent";

	readonly eventId: string;
	readonly occurredOn: Date;
	readonly payload: NodeLike;
	readonly tenant: string;

	constructor(
		readonly userEmail: string,
		tenant: string,
		node: NodeLike,
	) {
		this.eventId = NodeDeletedEvent.EVENT_ID;
		this.occurredOn = new Date();
		this.tenant = tenant;
		this.payload = node;
	}
}
