import { z } from "zod";

export const GroupDataSchema = z.object({
	uuid: z.string().regex(
		/^([a-z][a-z0-9-]{3,}|--[a-z][a-z0-9-]+--)$/,
		"UUID must be kebab-case (min 4 chars) or a builtin wrapped in --",
	),
	title: z.string().min(3, "Group title must be at least 3 characters"),
	description: z.string().optional(),
	createdTime: z.string(),
});

export type GroupDataSchemaType = z.infer<typeof GroupDataSchema>;
