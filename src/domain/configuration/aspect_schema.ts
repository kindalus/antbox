import { z } from "zod";
import { Aspects } from "domain/aspects/aspects.ts";
import type { AspectProperty } from "domain/configuration/aspect_data.ts";
import {
	FULLTEXT_FILTER_ERROR,
	hasFulltextFilter,
	NodeFiltersSchema as AnyNodeFiltersSchema,
} from "domain/nodes/node_filter.ts";

// Aspect filters are checked against one node in memory, where fulltext search is unavailable.
const NodeFiltersSchema = AnyNodeFiltersSchema.refine((filters) => !hasFulltextFilter(filters), {
	message: FULLTEXT_FILTER_ERROR,
});

const AspectValidationListValueSchema = z.union([z.string(), z.number()]);
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
	searchable: z.boolean().optional(),
	validationRegex: z.string().optional(),
	validationList: z.array(AspectValidationListValueSchema).optional(),
	validationFilters: NodeFiltersSchema.optional(),
	required: z.boolean().optional(),
	defaultValue: z.union([z.string(), z.number(), z.boolean()]).optional(),
}).superRefine((property, ctx) => {
	const regexError = property.validationRegex === undefined
		? undefined
		: Aspects.regexError(property.validationRegex);
	if (regexError) {
		ctx.addIssue({
			code: "custom",
			path: ["validationRegex"],
			message:
				`validationRegex of property '${property.name}' is not a valid JavaScript regular expression: ${regexError}`,
		});
	}

	// A default that breaks the property's own rules would make every node without a value invalid.
	if (property.defaultValue === undefined || regexError) return;
	const valid = Aspects.validateValue(property as AspectProperty, property.defaultValue);
	const reason = property.defaultValue === "" && property.type !== "string"
		? `an empty string is not a ${property.type} value`
		: valid.isLeft()
		? valid.value.message
		: undefined;
	if (reason) {
		ctx.addIssue({
			code: "custom",
			path: ["defaultValue"],
			message: `defaultValue of property '${property.name}' is invalid: ${reason}`,
		});
	}
});

const AspectPropertiesSchema = z.array(AspectPropertySchema).superRefine((properties, ctx) => {
	const seen = new Set<string>();
	for (const [index, property] of properties.entries()) {
		if (seen.has(property.name)) {
			ctx.addIssue({
				code: "custom",
				path: [index, "name"],
				message: `Duplicate property name '${property.name}'`,
			});
		}
		seen.add(property.name);
	}
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
	properties: AspectPropertiesSchema,
	createdTime: z.string(),
	modifiedTime: z.string(),
});

export type AspectDataSchemaType = z.infer<typeof AspectDataSchema>;
