import { Event } from "shared/event.ts";
import { TokenUsage } from "./chat_message.ts";

export class EmbeddingsGeneratedEvent implements Event {
	static EVENT_ID = "EmbeddingsGeneratedEvent";

	readonly eventId: string;
	readonly occurredOn: Date;
	readonly payload: {
		nodeUuid: string;
		model: string;
		usage: TokenUsage;
		context: "indexing" | "search";
	};
	readonly tenant: string;

	constructor(
		readonly userEmail: string,
		tenant: string,
		payload: {
			nodeUuid: string;
			model: string;
			usage: TokenUsage;
			context: "indexing" | "search";
		},
	) {
		this.eventId = EmbeddingsGeneratedEvent.EVENT_ID;
		this.occurredOn = new Date();
		this.tenant = tenant;
		this.payload = payload;
	}
}
