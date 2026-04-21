import { z } from "zod";

export const AgentDataSchema = z.object({
	uuid: z.string().regex(
		/^([a-z][a-z0-9-]{3,}|--[a-z][a-z0-9-]+--)$/,
		"UUID must be kebab-case (min 4 chars) or a builtin wrapped in --",
	),
	name: z.string().min(1, "Agent name is required"),
	description: z.string().optional(),
	exposedToUsers: z.boolean(),
	model: z.string().optional(),
	tools: z.union([z.boolean(), z.array(z.string())]).optional(),
	systemPrompt: z.string().trim().min(1, "systemPrompt must not be empty when provided")
		.optional(),
	maxLlmCalls: z.number().int().positive().optional(),
	createdTime: z.string(),
	modifiedTime: z.string(),
});
