import { z } from "zod";

export const GroupDataSchema = z.object({
	uuid: z.string().regex(
		/^([\w\d]{8,}|--[\w\d]{4,}--)$/,
		"UUID must be at least 8 alphanumeric characters or wrapped in -- with at least 4 characters",
	),
	title: z.string().min(3, "Group title must be at least 3 characters"),
	description: z.string().optional(),
	createdTime: z.string(),
});

export type GroupDataSchemaType = z.infer<typeof GroupDataSchema>;
