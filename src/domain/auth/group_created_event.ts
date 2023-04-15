import { Event } from "/shared/event.ts";

export class GroupCreatedEvent implements Event {
  static EVENT_ID = "GroupCreatedEvent";

  readonly eventId: string;
  readonly occurredOn: Date;
  readonly payload: Record<string, unknown>;

  constructor(readonly userEmail: string, groupId: string, name: string) {
    this.eventId = GroupCreatedEvent.EVENT_ID;
    this.occurredOn = new Date();
    this.payload = {
      groupId,
      name,
    };
  }
}
