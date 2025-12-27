import { z } from "zod";

/**
 * Zod schema for FeatureParameter validation
 */
const FeatureParameterSchema = z.object({
	name: z.string().min(1, "Parameter name is required"),
	type: z.enum(["string", "number", "boolean", "object", "array", "file"]),
	arrayType: z.enum(["string", "number", "file", "object"]).optional(),
	contentType: z.string().optional(),
	required: z.boolean(),
	description: z.string().optional(),
	defaultValue: z.union([z.string(), z.number(), z.boolean(), z.object({}), z.array(z.unknown())])
		.optional(),
});

/**
 * Zod schema for NodeFilter validation
 */
const NodeFilterSchema = z.tuple([
	z.string(),
	z.string(),
	z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
]);

/**
 * Zod schema for FeatureData validation
 */
export const FeatureDataSchema = z.object({
	uuid: z.string().regex(/^([\w\d]{8,}|--[\w\d]{4,}--)$/),
	title: z.string().min(1, "Feature title is required"),
	description: z.string().min(1, "Feature description is required"),
	exposeAction: z.boolean(),
	runOnCreates: z.boolean(),
	runOnUpdates: z.boolean(),
	runOnDeletes: z.boolean(),
	runManually: z.boolean(),
	filters: z.array(NodeFilterSchema),
	exposeExtension: z.boolean(),
	exposeAITool: z.boolean(),
	runAs: z.string().optional(),
	groupsAllowed: z.array(z.string()),
	parameters: z.array(FeatureParameterSchema),
	returnType: z.enum(["string", "number", "boolean", "array", "object", "file", "void"]),
	returnDescription: z.string().optional(),
	returnContentType: z.string().optional(),
	tags: z.array(z.string()).optional(),
	module: z.string().min(1, "Feature module is required"),
	createdTime: z.string(),
	modifiedTime: z.string(),
});
