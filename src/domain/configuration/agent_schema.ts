import { z } from "zod";

const agentTypeSchema = z.enum(["llm", "sequential", "parallel", "loop"]).optional();

/**
 * Zod schema for AgentData validation with conditional logic:
 * - LLM agents (type = "llm" or absent): require systemPrompt; tools optional
 * - Workflow agents (type = "sequential" | "parallel" | "loop"): require agents (non-empty);
 *   systemPrompt, model, tools must be absent
 */
export const AgentDataSchema = z
	.object({
		uuid: z.string().regex(/^([\w\d]{8,}|--[\w\d-]{4,}--)$/),
		name: z.string().min(1, "Agent name is required"),
		description: z.string().optional(),
		type: agentTypeSchema,
		exposedToUsers: z.boolean(),
		model: z.string().optional(),
		tools: z.union([z.boolean(), z.array(z.string())]).optional(),
		systemPrompt: z.string().optional(),
		agents: z.array(z.string()).optional(),
		createdTime: z.string(),
		modifiedTime: z.string(),
	})
	.superRefine((data, ctx) => {
		const type = data.type ?? "llm";

		if (type === "llm") {
			if (!data.systemPrompt || data.systemPrompt.trim().length === 0) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["systemPrompt"],
					message: "systemPrompt is required for LLM agents",
				});
			}
		} else {
			// Workflow agent
			if (!data.agents || data.agents.length === 0) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["agents"],
					message: "agents (non-empty) is required for workflow agents",
				});
			}
			if (data.systemPrompt !== undefined) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["systemPrompt"],
					message: "systemPrompt must not be set on workflow agents",
				});
			}
			if (data.model !== undefined) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["model"],
					message: "model must not be set on workflow agents",
				});
			}
			if (data.tools !== undefined) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["tools"],
					message: "tools must not be set on workflow agents",
				});
			}
		}
	});
