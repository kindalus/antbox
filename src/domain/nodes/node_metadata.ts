import { AspectProperties } from "domain/aspects/aspect_node.ts";
import { type Permissions } from "domain/nodes/node.ts";
import { type NodeFilters } from "domain/nodes/node_filter.ts";
import { type NodeProperties } from "domain/nodes/node_properties.ts";

import { FeatureParameter } from "domain/features/feature_node.ts";

export interface NodeMetadata {
	uuid: string;
	fid: string;
	title: string;
	name: string;
	description: string;
	mimetype: string;
	size: number;
	parent: string;
	createdTime: string;
	modifiedTime: string;
	owner: string;
	aspects: string[];
	tags: string[];
	related: string[];
	properties: NodeProperties | AspectProperties;
	fulltext: string;

	filters: NodeFilters;

	group: string;
	groups: string[];
	email: string;
	phone: string;
	hasWhatsapp: boolean;
	secret: string;

	onCreate: string[];
	onUpdate: string[];
	onDelete: string[];
	permissions: Permissions;

	runManually: boolean;
	runAs?: string;
	parameters: FeatureParameter[];
	returnType:
		| "string"
		| "number"
		| "boolean"
		| "array"
		| "object"
		| "file"
		| "void";
	returnDescription: string;
	returnContentType: string;

	groupsAllowed: string[];

	runOnCreates: boolean;
	runOnUpdates: boolean;
	runOnDeletes: boolean;

	exposeAction: boolean;
	exposeExtension: boolean;
	exposeAITool: boolean;

	// Agent properties
	model: string;
	temperature: number;
	maxTokens: number;
	reasoning: boolean;
	useTools: boolean;
	systemInstructions: string;
	structuredAnswer?: string;
}
