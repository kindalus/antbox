import { z } from "zod";

// Schema for AspectProperty
const AspectPropertySchema = z.object({
	name: z.string().regex(
		/^[a-zA-Z_][_a-zA-Z0-9_]{2,}$/,
		"Property name must start with letter or underscore and be at least 3 characters",
	),
	title: z.string().min(1, "Property title is required"),
	type: z.enum(["uuid", "string", "number", "boolean", "object", "array", "file"]),
	arrayType: z.enum(["string", "number", "uuid"]).optional(),
	contentType: z.string().optional(),
	readonly: z.boolean().optional(),
	validationRegex: z.string().optional(),
	validationList: z.array(z.string()).optional(),
	validationFilters: z.array(z.tuple([z.string(), z.string(), z.any()])).optional(),
	required: z.boolean().optional(),
	defaultValue: z.union([z.string(), z.number(), z.boolean()]).optional(),
});

// Schema for AspectData
export const AspectDataSchema = z.object({
	uuid: z.string().regex(
		/^([\w\d]{8,}|--[\w\d]{4,}--)$/,
		"UUID must be at least 8 alphanumeric characters or wrapped in -- with at least 4 characters",
	),
	title: z.string().min(3, "Aspect title must be at least 3 characters"),
	description: z.string().optional(),
	filters: z.array(z.tuple([z.string(), z.string(), z.any()])),
	properties: z.array(AspectPropertySchema),
	createdTime: z.string(),
	modifiedTime: z.string(),
});

export type AspectDataSchemaType = z.infer<typeof AspectDataSchema>;
