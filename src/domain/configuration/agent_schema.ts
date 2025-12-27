import { z } from "zod";

/**
 * Zod schema for AgentData validation
 */
export const AgentDataSchema = z.object({
	uuid: z.string().regex(/^([\w\d]{8,}|--[\w\d]{4,}--)$/),
	title: z.string().min(1, "Agent title is required"),
	description: z.string().optional(),
	model: z.string().min(1, "Agent model is required"),
	temperature: z.number().min(0).max(2, "Temperature must be between 0 and 2"),
	maxTokens: z.number().min(1, "Max tokens must be at least 1"),
	reasoning: z.boolean(),
	useTools: z.boolean(),
	systemInstructions: z.string().min(1, "System instructions are required"),
	structuredAnswer: z.string().optional(),
	createdTime: z.string(),
	modifiedTime: z.string(),
});
