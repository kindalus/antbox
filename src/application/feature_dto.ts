import { NodeFilters } from "domain/nodes/node_filter.ts";
import { FeatureNode, FeatureParameter } from "domain/features/feature_node.ts";
import { Feature } from "domain/features/feature.ts";
import { NodeMetadata } from "domain/nodes/node_metadata.ts";

export interface FeatureDTO {
	uuid: string;
	title: string;
	description: string;
	exposeAction: boolean;
	runOnCreates: boolean;
	runOnUpdates: boolean;
	runOnDeletes: boolean;
	runManually: boolean;
	filters: NodeFilters;

	exposeExtension: boolean;
	exposeAITool: boolean;

	runAs?: string;
	groupsAllowed: string[];
	parameters: FeatureParameter[];
	tags?: string[];

	returnType:
		| "string"
		| "number"
		| "boolean"
		| "array"
		| "object"
		| "file"
		| "void";
	returnDescription?: string;
	returnContentType?: string;
}

export function toFeatureDTO(node: FeatureNode | Feature | NodeMetadata): FeatureDTO {
	return {
		uuid: node.uuid,
		title: node.title,
		description: node.description || "",
		exposeAction: node.exposeAction || false,
		runOnCreates: node.runOnCreates || false,
		runOnUpdates: node.runOnUpdates || false,
		runOnDeletes: node.runOnDeletes || false,
		runManually: node.runManually || false,
		filters: node.filters || [],
		exposeExtension: node.exposeExtension || false,
		exposeAITool: node.exposeAITool || false,
		runAs: node.runAs,
		groupsAllowed: node.groupsAllowed || [],
		parameters: node.parameters || [],
		returnType: node.returnType!,
		returnDescription: node.returnDescription,
		returnContentType: node.returnContentType,
		tags: node.tags,
	};
}
