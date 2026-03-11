import { z } from "zod";

export const UserPreferencesDataSchema = z.object({
	email: z.string().email("Valid email is required"),
	preferences: z.record(z.string(), z.unknown()),
});

export type UserPreferencesDataSchemaType = z.infer<typeof UserPreferencesDataSchema>;
