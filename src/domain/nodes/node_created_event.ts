import { Node } from "./node.ts";
import { Event } from "../../shared/event.ts";

export class NodeCreatedEvent implements Event {
  static EVENT_ID = "NodeCreatedEvent";

  readonly eventId: string;
  readonly occurredOn: Date;
  readonly payload: Node;

  constructor(readonly userEmail: string, node: Node) {
    this.eventId = NodeCreatedEvent.EVENT_ID;
    this.occurredOn = new Date();
    this.payload = { ...node } as Node;
  }
}
