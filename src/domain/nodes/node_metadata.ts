import { type Permissions } from "domain/nodes/node.ts";
import { type NodeFilters } from "domain/nodes/node_filter.ts";
import { type NodeProperties } from "domain/nodes/node_properties.ts";
import { type ArticlePropertiesMap } from "../articles/article_properties.ts";

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

	onCreate?: string[];
	onUpdate?: string[];
	onDelete?: string[];
	permissions?: Permissions;

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
