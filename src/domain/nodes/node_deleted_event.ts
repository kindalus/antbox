import { type Event } from "shared/event.ts";
import { type NodeLike } from "./node_like.ts";

export class NodeDeletedEvent implements Event {
  static EVENT_ID = "NodeDeletedEvent";

  readonly eventId: string;
  readonly occurredOn: Date;
  readonly payload: NodeLike;

  constructor(
    readonly userEmail: string,
    node: NodeLike,
  ) {
    this.eventId = NodeDeletedEvent.EVENT_ID;
    this.occurredOn = new Date();
    this.payload = node;
  }
}
