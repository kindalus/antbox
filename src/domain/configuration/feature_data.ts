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

export const ACTION_UUIDS_PARAMETER_ERROR =
	"Action features must declare required parameter 'uuids' as array<string>";

export function hasRequiredActionUuidsParameter(parameters: FeatureParameter[]): boolean {
	const uuidsParameter = parameters.find((parameter) => parameter.name === "uuids");

	return Boolean(
		uuidsParameter &&
			uuidsParameter.type === "array" &&
			uuidsParameter.arrayType === "string" &&
			uuidsParameter.required,
	);
}

/**
 * FeatureData - Configuration data for features
 * Represents feature metadata and code in the configuration repository
 *
 * Features are mutable and can be updated after creation
 *
 * The `run` field contains the feature implementation as a JavaScript function source string.
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
	readonly run: string; // JavaScript function source for the feature runtime
	readonly createdTime: string;
	readonly modifiedTime: string;
}
