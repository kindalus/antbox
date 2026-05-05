import type { TelemetrySettings } from "ai";
import type { AttributeValue } from "@opentelemetry/api";
import { cleanTelemetryAttributes } from "shared/telemetry.ts";

type AITelemetryOperation = "agent_run" | "agent_final_answer_synthesis";

export interface AITelemetryContext {
	operation: AITelemetryOperation;
	tenant: string;
	agentUuid: string;
	model: string;
	interactionType: "chat" | "answer";
}

export function buildAITelemetrySettings(ctx: AITelemetryContext): TelemetrySettings {
	return {
		isEnabled: true,
		recordInputs: false,
		recordOutputs: false,
		functionId: `antbox.ai.${ctx.operation}`,
		metadata: cleanTelemetryAttributes({
			"antbox.tenant": ctx.tenant,
			"antbox.agent.uuid": ctx.agentUuid,
			"antbox.ai.interaction_type": ctx.interactionType,
			"gen_ai.operation.name": ctx.operation,
			"gen_ai.request.model": ctx.model,
		}) as Record<string, AttributeValue>,
	};
}
