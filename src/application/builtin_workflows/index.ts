import {
	PARALLEL_SPLIT_JOIN_WORKFLOW,
	PARALLEL_SPLIT_JOIN_WORKFLOW_UUID,
} from "./parallel_split_join_workflow.ts";
import {
	SEQUENTIAL_PIPELINE_WORKFLOW,
	SEQUENTIAL_PIPELINE_WORKFLOW_UUID,
} from "./sequential_pipeline_workflow.ts";
import {
	STATE_MACHINE_APPROVAL_WORKFLOW,
	STATE_MACHINE_APPROVAL_WORKFLOW_UUID,
} from "./state_machine_approval_workflow.ts";

/**
 * Built-in workflow definitions that are always available in the system.
 * These workflows serve as templates for common patterns.
 */
export const builtinWorkflows = [
	SEQUENTIAL_PIPELINE_WORKFLOW,
	PARALLEL_SPLIT_JOIN_WORKFLOW,
	STATE_MACHINE_APPROVAL_WORKFLOW,
];

/**
 * UUIDs for built-in workflows
 */
export const BUILTIN_WORKFLOW_UUIDS = {
	SEQUENTIAL_PIPELINE: SEQUENTIAL_PIPELINE_WORKFLOW_UUID,
	PARALLEL_SPLIT_JOIN: PARALLEL_SPLIT_JOIN_WORKFLOW_UUID,
	STATE_MACHINE_APPROVAL: STATE_MACHINE_APPROVAL_WORKFLOW_UUID,
} as const;

/**
 * Workflow pattern comparison summary:
 *
 * | Pattern             | Logic                              | Best For                                    |
 * |---------------------|------------------------------------|--------------------------------------------|
 * | Sequential Pipeline | Do A, then B, then C               | Simple, linear tasks (installation wizards)|
 * | Parallel Split-Join | Do A and B simultaneously, merge   | Efficiency; multi-department coordination  |
 * | State Machine       | Stay in A until X happens, go to B | Long-running processes reacting to events  |
 */

// Re-export individual workflows
export {
	PARALLEL_SPLIT_JOIN_WORKFLOW,
	PARALLEL_SPLIT_JOIN_WORKFLOW_UUID,
	SEQUENTIAL_PIPELINE_WORKFLOW,
	SEQUENTIAL_PIPELINE_WORKFLOW_UUID,
	STATE_MACHINE_APPROVAL_WORKFLOW,
	STATE_MACHINE_APPROVAL_WORKFLOW_UUID,
};
