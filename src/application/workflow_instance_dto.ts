import type {
	WorkflowDefinitionSnapshot,
	WorkflowInstance,
	WorkflowTransitionHistory,
} from "domain/workflows/workflow_instance.ts";

export interface WorkflowInstanceDTO {
	uuid: string;
	workflowDefinitionUuid: string;
	nodeUuid: string;
	currentStateName: string;
	history?: WorkflowTransitionHistory[];
	running: boolean;
	cancelled: boolean;
	workflowDefinition?: WorkflowDefinitionSnapshot;
	groupsAllowed: string[];
	owner: string;
	startedTime: string;
}

export function toWorkflowInstanceDTO(instance: WorkflowInstance): WorkflowInstanceDTO {
	return {
		uuid: instance.uuid,
		workflowDefinitionUuid: instance.workflowDefinitionUuid,
		nodeUuid: instance.nodeUuid,
		currentStateName: instance.currentStateName,
		history: instance.history,
		running: instance.running,
		cancelled: instance.cancelled,
		workflowDefinition: instance.workflowDefinition,
		groupsAllowed: instance.groupsAllowed,
		owner: instance.owner,
		startedTime: instance.startedTime,
	};
}
