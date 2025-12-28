import { WorkflowData, WorkflowState } from "domain/configuration/workflow_data.ts";

/**
 * Quick Task Workflow (2 states, sequential)
 *
 * Pattern: Open → Done
 *
 * Use Case: Minimal lifecycle where items are either active or completed.
 */
export const QUICK_TASK_WORKFLOW_UUID = "builtin-quick-task";

const states: WorkflowState[] = [
	{
		name: "Open",
		isInitial: true,
		transitions: [
			{
				signal: "complete",
				targetState: "Done",
			},
		],
	},
	{
		name: "Done",
		isFinal: true,
	},
];

export const QUICK_TASK_WORKFLOW: WorkflowData = {
	uuid: QUICK_TASK_WORKFLOW_UUID,
	title: "Quick Task",
	description: "A simple sequential workflow: Open → Done.",
	states,
	availableStateNames: states.map((s) => s.name),
	filters: [], // Applies to all nodes
	groupsAllowed: [],
	createdTime: new Date().toISOString(),
	modifiedTime: new Date().toISOString(),
};
