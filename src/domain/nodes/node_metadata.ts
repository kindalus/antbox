import { type Permissions } from "domain/nodes/node.ts";
import { type NodeFilters } from "domain/nodes/node_filter.ts";
import { type NodeProperties } from "domain/nodes/node_properties.ts";
import { type ArticlePropertiesMap } from "../articles/article_properties.ts";
import type { FeatureParameter } from "domain/configuration/feature_data.ts";
import type { WorkflowState } from "domain/configuration/workflow_data.ts";

export interface NodeMetadata {
	uuid: string;
	fid: string;
	title: string;
	description?: string;
	mimetype: string;
	size?: number;
	parent: string;
	createdTime: string;
	modifiedTime: string;
	owner: string;
	aspects?: string[];
	tags?: string[];
	related?: string[];
	properties?: NodeProperties;
	fulltext?: string;

	filters?: NodeFilters;

	group?: string;
	groups?: string[];
	email?: string;
	phone?: string;
	hasWhatsapp?: boolean;
	secret?: string;
	active?: boolean;

	onCreate?: string[];
	onUpdate?: string[];
	onDelete?: string[];
	permissions?: Permissions;

	runManually?: boolean;
	runAs?: string;
	parameters?: FeatureParameter[];
	returnType?:
		| "string"
		| "number"
		| "boolean"
		| "array"
		| "object"
		| "file"
		| "void";
	returnDescription?: string;
	returnContentType?: string;

	groupsAllowed?: string[];

	runOnCreates?: boolean;
	runOnUpdates?: boolean;
	runOnDeletes?: boolean;

	exposeAction?: boolean;
	exposeExtension?: boolean;
	exposeAITool?: boolean;

	// Agent properties
	model?: string;
	temperature?: number;
	maxTokens?: number;
	reasoning?: boolean;
	useTools?: boolean;
	systemInstructions?: string;
	structuredAnswer?: string;

	// Workflow properties
	states?: WorkflowState[];
	availableStateNames?: string[];

	// Lock properties
	locked?: boolean;
	lockedBy?: string;
	unlockAuthorizedGroups?: string[];

	// Workflow related properties
	workflowInstanceUuid?: string;
	workflowState?: string;

	// Article related properties
	articleProperties?: ArticlePropertiesMap;
	articleAuthor?: string;
}
