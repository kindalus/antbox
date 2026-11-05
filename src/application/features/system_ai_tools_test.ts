import { describe, it } from "bdd";
import { expect } from "expect";
import { right } from "shared/either.ts";
import type { Event } from "shared/event.ts";
import type { EventBus } from "shared/event_bus.ts";
import type { NodeService } from "application/nodes/node_service.ts";
import type { AuthenticationContext } from "application/security/authentication_context.ts";
import { OcrCompletedEvent } from "domain/ai/ocr_completed_event.ts";
import { runSystemAITool } from "./system_ai_tools.ts";

const ctx: AuthenticationContext = {
	tenant: "tenant-a",
	principal: { email: "user@example.com", groups: [] },
	mode: "Direct",
};

describe("runSystemAITool", () => {
	it("OcrModel:ocr returns the text and records its usage", async () => {
		const published: Event[] = [];
		const usage = { promptTokens: 30, completionTokens: 12, totalTokens: 42 };

		const result = await runSystemAITool<string>(ctx, "OcrModel:ocr", { uuid: "node-1" }, {
			nodeService: {
				export: () => Promise.resolve(right(new File(["x"], "x.pdf"))),
			} as unknown as NodeService,
			ocrProvider: { ocr: () => Promise.resolve(right({ text: "scanned text", usage })) },
			eventBus: {
				publish: (event: Event) => published.push(event),
				subscribe: () => {},
				unsubscribe: () => {},
			} as unknown as EventBus,
		});

		expect(result.isRight()).toBe(true);
		expect(result.value).toBe("scanned text");
		expect(published.length).toBe(1);
		const event = published[0] as OcrCompletedEvent;
		expect(event).toBeInstanceOf(OcrCompletedEvent);
		expect(event.userEmail).toBe("user@example.com");
		expect(event.tenant).toBe("tenant-a");
		expect(event.payload).toEqual({ nodeUuid: "node-1", context: "tool", usage });
	});
});
