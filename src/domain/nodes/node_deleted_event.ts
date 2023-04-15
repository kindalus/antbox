import { Event } from "/shared/event.ts";
export class NodeDeletedEvent implements Event {
  static EVENT_ID = "NodeDeletedEvent";

  readonly eventId: string;
  readonly occurredOn: Date;
  readonly payload: { uuid: string };

  constructor(readonly userEmail: string, uuid: string) {
    this.eventId = NodeDeletedEvent.EVENT_ID;
    this.occurredOn = new Date();
    this.payload = { uuid };
  }
}
