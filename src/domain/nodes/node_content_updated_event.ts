import { Event } from "../../shared/event.ts";

export class NodeContentUpdatedEvent implements Event {
  static EVENT_ID = "NodeContentUpdatedEvent";

  readonly eventId: string;
  readonly occurredOn: Date;
  readonly payload: { uuid: string };

  constructor(readonly userEmail: string, uuid: string) {
    this.eventId = NodeContentUpdatedEvent.EVENT_ID;
    this.occurredOn = new Date();
    this.payload = { uuid };
  }
}
