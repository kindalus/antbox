import { Node } from "./node.ts";
import { Event } from "/shared/event.ts";
export class NodeCreatedEvent implements Event {
  static EVENT_ID = "NodeCreatedEvent";

  readonly eventId: string;
  readonly occurredOn: Date;
  readonly payload: Record<string, unknown>;

  constructor(node: Node) {
    this.eventId = NodeCreatedEvent.EVENT_ID;
    this.occurredOn = new Date();
    this.payload = { ...(this.payload = node) };
  }
}
