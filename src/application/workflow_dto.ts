import { WorkflowNode, WorkflowState } from "domain/workflows/workflow_node.ts";

export interface WorkflowDTO {
	uuid: string;
	title: string;
	description: string;
	owner: string;
	createdTime: string;
	modifiedTime: string;
	states: WorkflowState[];
	availableStateNames: string[];
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
	};
}
