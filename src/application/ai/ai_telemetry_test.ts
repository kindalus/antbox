import { describe, it } from "bdd";
import { expect } from "expect";
import { buildAITelemetrySettings } from "./ai_telemetry.ts";

describe("buildAITelemetrySettings", () => {
	it("enables AI SDK telemetry without recording prompts or outputs", () => {
		const telemetry = buildAITelemetrySettings({
			operation: "agent_run",
			tenant: "tenant-a",
			agentUuid: "agent-1",
			model: "google/gemini-2.5-flash",
			interactionType: "answer",
		});

		expect(telemetry.isEnabled).toBe(true);
		expect(telemetry.recordInputs).toBe(false);
		expect(telemetry.recordOutputs).toBe(false);
		expect(telemetry.functionId).toBe("antbox.ai.agent_run");
		expect(telemetry.metadata).toEqual({
			"antbox.tenant": "tenant-a",
			"antbox.agent.uuid": "agent-1",
			"antbox.ai.interaction_type": "answer",
			"gen_ai.operation.name": "agent_run",
			"gen_ai.request.model": "google/gemini-2.5-flash",
		});
	});
});
