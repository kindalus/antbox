import { Event } from "../../shared/event.ts";
import { Node } from "./node.ts";

export class NodeDeletedEvent implements Event {
	static EVENT_ID = "NodeDeletedEvent";

	readonly eventId: string;
	readonly occurredOn: Date;
	readonly payload: Node;

	constructor(readonly userEmail: string, node: Node) {
		this.eventId = NodeDeletedEvent.EVENT_ID;
		this.occurredOn = new Date();
		this.payload = node;
	}
}
