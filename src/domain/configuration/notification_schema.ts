import { z } from "zod";

export const NotificationDataSchema = z
	.object({
		uuid: z.string().regex(
			/^([a-z][a-z0-9-]{3,}|--[a-z][a-z0-9-]+--)$/,
			"UUID must be kebab-case (min 4 chars) or a builtin wrapped in --",
		),
		targetUser: z.string().email("Target user must be a valid email").optional(),
		targetGroup: z.string().min(1, "Target group must not be empty").optional(),
		priority: z.enum(["CRITICAL", "INFO", "INSIGHT"], {
			message: "Priority must be CRITICAL, INFO, or INSIGHT",
		}),
		title: z.string().min(1, "Notification title is required"),
		body: z.string().min(1, "Notification body is required"),
		timestamp: z.string(),
	})
	.refine(
		(data) => data.targetUser !== undefined || data.targetGroup !== undefined,
		{
			message: "Notification must have at least one target: targetUser or targetGroup",
		},
	);

export type NotificationDataSchemaType = z.infer<typeof NotificationDataSchema>;
