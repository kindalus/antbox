import type {
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
}

export function toWorkflowInstanceDTO(instance: WorkflowInstance): WorkflowInstanceDTO {
	return {
		uuid: instance.uuid,
		workflowDefinitionUuid: instance.workflowDefinitionUuid,
		nodeUuid: instance.nodeUuid,
		currentStateName: instance.currentStateName,
		history: instance.history,
		running: instance.running,
	};
}
