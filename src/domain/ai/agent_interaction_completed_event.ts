import { Event } from "shared/event.ts";
import { TokenUsage } from "./chat_message.ts";

export class AgentInteractionCompletedEvent implements Event {
	static EVENT_ID = "AgentInteractionCompletedEvent";

	readonly eventId: string;
	readonly occurredOn: Date;
	readonly payload: {
		agentUuid: string;
		usage: TokenUsage;
		interactionType: "chat" | "answer";
	};
	readonly tenant: string;

	constructor(
		readonly userEmail: string,
		tenant: string,
		payload: {
			agentUuid: string;
			usage: TokenUsage;
			interactionType: "chat" | "answer";
		},
	) {
		this.eventId = AgentInteractionCompletedEvent.EVENT_ID;
		this.occurredOn = new Date();
		this.tenant = tenant;
		this.payload = payload;
	}
}
