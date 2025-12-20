import { WorkflowNode, WorkflowState } from "domain/workflows/workflow_node.ts";
import { NodeFilters } from "domain/nodes/node_filter.ts";

export interface WorkflowDTO {
	uuid: string;
	title: string;
	description: string;
	owner: string;
	createdTime: string;
	modifiedTime: string;
	states: WorkflowState[];
	availableStateNames: string[];
	filters: NodeFilters;
	groupsAllowed: string[];
}

export function toWorkflowDTO(node: WorkflowNode): WorkflowDTO {
	return {
		uuid: node.uuid,
		title: node.title,
		description: node.description || "",
		owner: node.owner,
		createdTime: node.createdTime,
		modifiedTime: node.modifiedTime,
		states: node.states,
		availableStateNames: node.availableStateNames,
		filters: node.filters,
		groupsAllowed: node.groupsAllowed,
	};
}
