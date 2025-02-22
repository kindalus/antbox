import { type Event } from "shared/event.ts";

export class GroupDeletedEvent implements Event {
  static EVENT_ID = "GroupDeletedEvent";

  readonly eventId: string;
  readonly occurredOn: Date;
  readonly payload: Record<string, unknown>;

  constructor(
    readonly userEmail: string,
    uuid: string,
  ) {
    this.eventId = GroupDeletedEvent.EVENT_ID;
    this.occurredOn = new Date();
    this.payload = {
      uuid,
    };
  }
}
