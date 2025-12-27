import { z } from "zod";

export const ApiKeyDataSchema = z.object({
	uuid: z.string().regex(
		/^([\w\d]{8,}|--[\w\d]{4,}--)$/,
		"UUID must be at least 8 alphanumeric characters or wrapped in -- with at least 4 characters",
	),
	title: z.string().min(4, "API key title must be at least 4 characters"),
	secret: z.string().min(16, "API key secret must be at least 16 characters"),
	group: z.string().min(1, "API key must have a group"),
	description: z.string().optional(),
	active: z.boolean(),
	createdTime: z.string(),
});

export type ApiKeyDataSchemaType = z.infer<typeof ApiKeyDataSchema>;
