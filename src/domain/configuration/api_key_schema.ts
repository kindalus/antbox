import { z } from "zod";

export const ApiKeyDataSchema = z.object({
	uuid: z.string().regex(
		/^[a-zA-Z0-9]{8}$/,
		"UUID must be exactly 8 alphanumeric characters",
	),
	title: z.string().min(4, "API key title must be at least 4 characters"),
	secret: z.string().min(16, "API key secret must be at least 16 characters"),
	group: z.string().min(1, "API key must have a group"),
	description: z.string().optional(),
	active: z.boolean(),
	createdTime: z.string(),
});

export type ApiKeyDataSchemaType = z.infer<typeof ApiKeyDataSchema>;
