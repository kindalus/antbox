import { z } from "zod";

const AspectValidationListValueSchema = z.union([z.string(), z.number()]);
const FilterOperatorSchema = z.enum([
	"==",
	"<=",
	">=",
	"<",
	">",
	"!=",
	"in",
	"not-in",
	"match",
	"contains",
	"contains-all",
	"contains-any",
	"not-contains",
	"contains-none",
]);
const NodeFilterSchema = z.tuple([z.string().min(1), FilterOperatorSchema, z.unknown()]);
const NodeFiltersSchema = z.union([
	z.array(NodeFilterSchema),
	z.array(z.array(NodeFilterSchema)),
]);

// Schema for AspectProperty
const AspectPropertySchema = z.object({
	name: z.string().regex(
		/^[a-z][a-z0-9-]{2,}$/,
		"Property name must be kebab-case (min 3 chars)",
	),
	title: z.string().min(1, "Property title is required"),
	type: z.enum(["uuid", "string", "number", "boolean", "object", "array", "date"]),
	arrayType: z.enum(["string", "number", "uuid"]).optional(),
	contentType: z.string().optional(),
	readonly: z.boolean().optional(),
	validationRegex: z.string().optional(),
	validationList: z.array(AspectValidationListValueSchema).optional(),
	validationFilters: NodeFiltersSchema.optional(),
	required: z.boolean().optional(),
	defaultValue: z.union([z.string(), z.number(), z.boolean()]).optional(),
});

// Schema for AspectData
export const AspectDataSchema = z.object({
	uuid: z.string().regex(
		/^([a-z][a-z0-9-]{3,}|--[a-z][a-z0-9-]+--)$/,
		"UUID must be kebab-case (min 4 chars) or a builtin wrapped in --",
	),
	title: z.string().min(3, "Aspect title must be at least 3 characters"),
	description: z.string().optional(),
	filters: NodeFiltersSchema,
	properties: z.array(AspectPropertySchema),
	createdTime: z.string(),
	modifiedTime: z.string(),
});

export type AspectDataSchemaType = z.infer<typeof AspectDataSchema>;
