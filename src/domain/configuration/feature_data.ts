import type { NodeFilter } from "domain/nodes/node_filter.ts";

/**
 * Feature parameter type definition
 */
export type FeatureParameterType = "string" | "number" | "boolean" | "object" | "array" | "file";
export type FeatureParameterArrayType = "string" | "number" | "file" | "object";

export interface FeatureParameter {
	name: string;
	type: FeatureParameterType;
	arrayType?: FeatureParameterArrayType;
	contentType?: string;
	required: boolean;
	description?: string;
	defaultValue?: string | number | boolean | object | Array<unknown>;
}

/**
 * FeatureData - Configuration data for features
 * Represents feature metadata and code in the configuration repository
 *
 * Features are mutable and can be updated after creation
 *
 * The `module` field contains the entire JavaScript/TypeScript module as a string,
 * including the run function implementation.
 */
export interface FeatureData {
	readonly uuid: string;
	readonly title: string;
	readonly description: string;
	readonly exposeAction: boolean;
	readonly runOnCreates: boolean;
	readonly runOnUpdates: boolean;
	readonly runOnDeletes: boolean;
	readonly runManually: boolean;
	readonly filters: NodeFilter[];
	readonly exposeExtension: boolean;
	readonly exposeAITool: boolean;
	readonly runAs?: string;
	readonly groupsAllowed: string[];
	readonly parameters: FeatureParameter[];
	readonly returnType: "string" | "number" | "boolean" | "array" | "object" | "file" | "void";
	readonly returnDescription?: string;
	readonly returnContentType?: string;
	readonly tags?: string[];
	readonly module: string; // The entire JavaScript/TypeScript module as a string
	readonly createdTime: string;
	readonly modifiedTime: string;
}
