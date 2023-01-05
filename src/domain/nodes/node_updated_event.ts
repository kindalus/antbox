import { UserPrincipal } from "../auth/user_principal.ts";
import { Node } from "./node.ts";
import { Event } from "/shared/event.ts";
export class NodeUpdatedEvent implements Event {
  static EVENT_ID = "NodeUpdatedEvent";

  readonly eventId: string;
  readonly occurredOn: Date;
  readonly payload: { uuid: string };

  constructor(
    readonly principal: UserPrincipal,
    uuid: string,
    data: Partial<Node>
  ) {
    this.eventId = NodeUpdatedEvent.EVENT_ID;
    this.occurredOn = new Date();
    this.payload = { uuid, ...data };
  }
}
