import { type Event } from "shared/event.ts";
import type { NodeMetadata } from "./node_metadata.ts";

export interface NodeUpdateChanges {
	readonly uuid: string;
	readonly oldValues: Partial<NodeMetadata>;
	readonly newValues: Partial<NodeMetadata>;
}

export class NodeUpdatedEvent implements Event {
	static EVENT_ID = "NodeUpdatedEvent";

	readonly eventId: string;
	readonly occurredOn: Date;
	readonly payload: NodeUpdateChanges;
	readonly tenant: string;

	constructor(
		readonly userEmail: string,
		tenant: string,
		changes: NodeUpdateChanges,
	) {
		this.eventId = NodeUpdatedEvent.EVENT_ID;
		this.occurredOn = new Date();
		this.tenant = tenant;
		this.payload = changes;
	}
}
