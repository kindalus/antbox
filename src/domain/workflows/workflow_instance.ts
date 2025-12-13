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
