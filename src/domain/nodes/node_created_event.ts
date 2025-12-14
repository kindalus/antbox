import { Event } from "shared/event.ts";
import { NodeMetadata } from "./node_metadata.ts";

export class NodeCreatedEvent implements Event {
	static EVENT_ID = "NodeCreatedEvent";

	readonly eventId: string;
	readonly occurredOn: Date;
	readonly payload: NodeMetadata;
	readonly tenant: string;

	constructor(
		readonly userEmail: string,
		tenant: string,
		node: NodeMetadata,
	) {
		this.eventId = NodeCreatedEvent.EVENT_ID;
		this.occurredOn = new Date();
		this.tenant = tenant;
		this.payload = node;
	}
}
