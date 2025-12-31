import { z } from "zod";

export const NotificationDataSchema = z
	.object({
		uuid: z.string().regex(
			/^([\w\d]{8,}|--[\w\d]{4,}--)$/,
			"UUID must be at least 8 alphanumeric characters or wrapped in -- with at least 4 characters",
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
