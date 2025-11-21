import { NodeFilters } from "domain/nodes/node_filter.ts";
import { FeatureNode, FeatureParameter } from "domain/features/feature_node.ts";
import { Feature } from "domain/features/feature.ts";

export interface FeatureDTO {
	uuid: string;
	name: string;
	description: string;
	exposeAction: boolean;
	runOnCreates: boolean;
	runOnUpdates: boolean;
	runManually: boolean;
	filters: NodeFilters;

	exposeExtension: boolean;
	exposeAITool: boolean;

	runAs?: string;
	groupsAllowed: string[];
	parameters: FeatureParameter[];

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

export function toFeatureDTO(node: FeatureNode | Feature): FeatureDTO {
	return {
		uuid: node.uuid,
		name: node.name,
		description: node.description || "",
		exposeAction: node.exposeAction || false,
		runOnCreates: node.runOnCreates || false,
		runOnUpdates: node.runOnUpdates || false,
		runManually: node.runManually || false,
		filters: node.filters || [],
		exposeExtension: node.exposeExtension || false,
		exposeAITool: node.exposeAITool || false,
		runAs: node.runAs,
		groupsAllowed: node.groupsAllowed || [],
		parameters: node.parameters || [],
		returnType: node.returnType,
		returnDescription: node.returnDescription,
		returnContentType: node.returnContentType,
	};
}
