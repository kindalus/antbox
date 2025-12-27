import { WorkflowData, WorkflowState } from "domain/configuration/workflow_data.ts";

/**
 * Standard Task Workflow (3 states, sequential)
 *
 * Pattern: Open → In Progress → Done
 *
 * Use Case: Common lifecycle where work is explicitly started before completion.
 */
export const STANDARD_TASK_WORKFLOW_UUID = "builtin-standard-task";

const states: WorkflowState[] = [
	{
		name: "Open",
		isInitial: true,
		transitions: [
			{
				signal: "start",
				targetState: "In Progress",
			},
		],
	},
	{
		name: "In Progress",
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

export const STANDARD_TASK_WORKFLOW: WorkflowData = {
	uuid: STANDARD_TASK_WORKFLOW_UUID,
	title: "Standard Task",
	description: "A sequential workflow with a working state: Open → In Progress → Done.",
	states,
	availableStateNames: states.map((s) => s.name),
	filters: [], // Applies to all nodes
	groupsAllowed: [],
	createdTime: new Date().toISOString(),
	modifiedTime: new Date().toISOString(),
};
