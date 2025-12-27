import { z } from "zod";

export const UserDataSchema = z.object({
	email: z.string().email("Valid email is required"),
	title: z.string().regex(
		/^(\s*\S+(?:\s+\S+)+\s*|root|anonymous)$/,
		"Full name must include at least first name and last name",
	),
	group: z.string().min(1, "User must have at least one group"),
	groups: z.array(z.string()),
	phone: z.string().optional(),
	hasWhatsapp: z.boolean(),
	active: z.boolean(),
	createdTime: z.string(),
	modifiedTime: z.string(),
});

export type UserDataSchemaType = z.infer<typeof UserDataSchema>;
