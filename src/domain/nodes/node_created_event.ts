import type { NodeLike } from "domain/node_like";
import { type Event } from "shared/event.ts";

export class NodeCreatedEvent implements Event {
  static EVENT_ID = "NodeCreatedEvent";

  readonly eventId: string;
  readonly occurredOn: Date;
  readonly payload: NodeLike;
  readonly tenant: string;

  constructor(
    readonly userEmail: string,
    tenant: string,
    node: NodeLike,
  ) {
    this.eventId = NodeCreatedEvent.EVENT_ID;
    this.occurredOn = new Date();
    this.tenant = tenant;
    this.payload = node;
  }
}
