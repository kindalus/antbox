import { Event } from "shared/event.ts";
import { TokenUsage } from "./chat_message.ts";

export type OcrContext = "indexing" | "tool";

export class OcrCompletedEvent implements Event {
	static EVENT_ID = "OcrCompletedEvent";

	readonly eventId: string;
	readonly occurredOn: Date;
	readonly tenant: string;

	constructor(
		readonly userEmail: string,
		tenant: string,
		readonly payload: {
			nodeUuid: string;
			usage: TokenUsage;
			context: OcrContext;
		},
	) {
		this.eventId = OcrCompletedEvent.EVENT_ID;
		this.occurredOn = new Date();
		this.tenant = tenant;
	}
}
