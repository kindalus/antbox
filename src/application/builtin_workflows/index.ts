import { QUICK_TASK_WORKFLOW, QUICK_TASK_WORKFLOW_UUID } from "./quick_task_workflow.ts";
import { STANDARD_TASK_WORKFLOW, STANDARD_TASK_WORKFLOW_UUID } from "./standard_task_workflow.ts";

/**
 * Built-in workflow definitions that are always available in the system.
 * These workflows serve as templates for common patterns.
 */
export const builtinWorkflows = [
	QUICK_TASK_WORKFLOW,
	STANDARD_TASK_WORKFLOW,
];

/**
 * UUIDs for built-in workflows
 */
export const BUILTIN_WORKFLOW_UUIDS = {
	QUICK_TASK: QUICK_TASK_WORKFLOW_UUID,
	STANDARD_TASK: STANDARD_TASK_WORKFLOW_UUID,
} as const;

/**
 * Workflow pattern comparison summary:
 *
 * | Pattern       | Logic                      | Best For                                  |
 * |--------------|----------------------------|------------------------------------------|
 * | Quick Task   | Open → Done                | Minimal lifecycle (binary status)        |
 * | Standard Task| Open → In Progress → Done  | Common lifecycle with explicit "working" |
 */

// Re-export individual workflows
export {
	QUICK_TASK_WORKFLOW,
	QUICK_TASK_WORKFLOW_UUID,
	STANDARD_TASK_WORKFLOW,
	STANDARD_TASK_WORKFLOW_UUID,
};
