import type { WorkflowState } from "domain/configuration/workflow_data.ts";

/**
 * A snapshot of the workflow definition as it existed when the instance started.
 * This protects running instances from changes to the underlying workflow definition.
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
 * Represents a running workflow attached to a specific Node.
 * This is the runtime instance that tracks the current state of a node as it moves through a workflow.
 */
export interface WorkflowInstance {
	/** Unique identifier for this workflow instance (primary key) */
	uuid: string;

	/**
	 * The UUID of the workflow definition being used.
	 * References a WorkflowNode that defines the states and transitions.
	 */
	workflowDefinitionUuid: string;

	/**
	 * Snapshot of the workflow definition at the time the instance started.
	 * Optional for backwards compatibility with persisted instances created
	 * before workflow snapshots existed.
	 */
	workflowDefinition?: WorkflowDefinitionSnapshot;

	/**
	 * The UUID of the Node (file/data) being processed by this workflow.
	 */
	nodeUuid: string;

	/**
	 * The name of the current state the node is in.
	 * Must be one of the state names defined in the workflow definition.
	 */
	currentStateName: string;

	/**
	 * Recent history of transitions (optional, for quick access).
	 * This may contain only the last N transitions.
	 * Full history is stored in WorkflowTransitionHistoryRepository.
	 */
	history?: WorkflowTransitionHistory[];

	running: boolean;

	/**
	 * Whether this workflow instance has been cancelled.
	 * A cancelled workflow stops running and cannot be transitioned further.
	 */
	cancelled: boolean;

	/**
	 * List of groups allowed to view and interact with this workflow instance.
	 * If empty, all users can view and interact with the instance.
	 * Copied from workflow definition at start time, but can be overridden.
	 */
	groupsAllowed: string[];

	/**
	 * Email of the user who started this workflow instance.
	 */
	owner: string;

	/**
	 * Timestamp when this workflow instance was started.
	 */
	startedTime: string;
}

/**
 * Represents a single transition event in the workflow history.
 * Stored in a dedicated WorkflowTransitionHistoryRepository.
 */
export interface WorkflowTransitionHistory {
	/** The state name before the transition */
	from: string;

	/** The state name after the transition */
	to: string;

	/** The signal that triggered this transition */
	signal: string;

	/** When this transition occurred */
	timestamp: Date;

	/** The email of the user who triggered the transition */
	user: string;

	/** Optional message or comment about this transition */
	message?: string;
}
