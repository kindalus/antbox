import type { NodeFilters } from "domain/nodes/node_filter.ts";

/**
 * WorkflowTransition - Defines a movement from one state to another
 */
export interface WorkflowTransition {
	/** The signal/event name that triggers this transition */
	signal: string;
	/** The name of the destination state */
	targetState: string;
	/** Guard Conditions: transition is only valid if the Node satisfies these filters */
	filters?: NodeFilters;
	/** IDs/Names of actions to execute during the transition */
	actions?: string[];
	/** List of groups allowed to execute this transition */
	groupsAllowed?: string[];
}

/**
 * WorkflowState - Represents a specific status in the lifecycle
 */
export interface WorkflowState {
	/** Unique name of the state (e.g., "Draft", "In Review") */
	name: string;
	/** List of groups allowed to modify the node in this state */
	groupsAllowedToModify?: string[];
	/** Is this where new items start? */
	isInitial?: boolean;
	/** Is the workflow complete when reaching this state? */
	isFinal?: boolean;
	/** Actions to execute when ENTERING this state */
	onEnter?: string[];
	/** Actions to execute before LEAVING this state */
	onExit?: string[];
	/** The possible paths out of this state */
	transitions?: WorkflowTransition[];
}

/**
 * WorkflowData - Immutable configuration data for workflow definitions
 * Defines the states and transitions for a business process
 *
 * Note: Workflows can be updated (states and transitions can change)
 */
export interface WorkflowData {
	readonly uuid: string;
	readonly title: string;
	readonly description?: string;
	readonly states: WorkflowState[];
	readonly availableStateNames: string[];
	readonly filters: NodeFilters;
	readonly groupsAllowed: string[];
	readonly createdTime: string;
	readonly modifiedTime: string;
}
