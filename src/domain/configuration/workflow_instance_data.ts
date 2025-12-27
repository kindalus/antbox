import type { WorkflowState } from "./workflow_data.ts";

/**
 * WorkflowDefinitionSnapshot - A snapshot of the workflow definition
 * Protects running instances from changes to the underlying workflow definition
 */
export interface WorkflowDefinitionSnapshot {
	uuid: string;
	title: string;
	description: string;
	createdTime: string;
	modifiedTime: string;
	states: WorkflowState[];
	availableStateNames: string[];
	groupsAllowed: string[];
}

/**
 * WorkflowTransitionHistory - A single transition event
 */
export interface WorkflowTransitionHistory {
	/** The state name before the transition */
	from: string;
	/** The state name after the transition */
	to: string;
	/** The signal that triggered this transition */
	signal: string;
	/** When this transition occurred */
	timestamp: string;
	/** The email of the user who triggered the transition */
	user: string;
	/** Optional message or comment */
	message?: string;
}

/**
 * WorkflowInstanceData - Runtime instance of a workflow attached to a specific node
 * Tracks the current state of a node as it moves through a workflow
 *
 * Note: Workflow instances are updated as they transition through states
 */
export interface WorkflowInstanceData {
	/** Unique identifier for this workflow instance */
	readonly uuid: string;
	/** The UUID of the workflow definition being used */
	readonly workflowDefinitionUuid: string;
	/** Snapshot of the workflow definition at instance start time */
	readonly workflowDefinition: WorkflowDefinitionSnapshot;
	/** The UUID of the Node being processed by this workflow */
	readonly nodeUuid: string;
	/** The name of the current state */
	readonly currentStateName: string;
	/** Recent history of transitions */
	readonly history: WorkflowTransitionHistory[];
	/** Is the workflow still running? */
	readonly running: boolean;
	/** Has this workflow instance been cancelled? */
	readonly cancelled: boolean;
	/** List of groups allowed to view and interact */
	readonly groupsAllowed: string[];
	/** Email of the user who started this workflow */
	readonly owner: string;
	/** When this workflow instance was started */
	readonly startedTime: string;
	/** When this workflow instance was last modified (state transition) */
	readonly modifiedTime: string;
}
