import { AspectProperty } from "../aspects/aspect.ts";
import { FormPropertySpecification } from "../forms_specifications/form_specification.ts";
import { Permissions } from "./node.ts";
import { NodeFilter } from "./node_filter.ts";
import { NodeProperties } from "./node_properties.ts";
import { Aggregation } from "./smart_folder_node.ts";

export interface NodeMetadata {
	uuid: string;
	fid: string;
	title: string;
	description: string;
	mimetype: string;
	size: number;
	aspects?: string[];
	parent: string;
	createdTime: string;
	modifiedTime: string;
	owner: string;
	properties: NodeProperties | AspectProperty[] | FormPropertySpecification[];
	fulltext: string;

	filters: NodeFilter[];
	aggregations: Aggregation[];

	group: string;
	groups: string[];
	email: string;
	secret: string;

	onCreate: string[];
	onUpdate: string[];
	childFilters: NodeFilter[];
	permissions: Permissions;

	runManually: boolean;
	runAs?: string;
	params: string[];
	groupsAllowed: string[];

	runOnCreates: boolean;
	runOnUpdates: boolean;

	targetAspect: string;
	height: number;
	width: number;
}
