import type { WorkflowData } from "./workflow_data.ts";

/**
 * Builtin workflows
 * These workflow definitions are always available and immutable.
 */

const BUILTIN_TIME = "2024-01-01T00:00:00.000Z";

export const QUICK_TASK_WORKFLOW_UUID = "builtin-quick-task";
export const STANDARD_TASK_WORKFLOW_UUID = "builtin-standard-task";

export const BUILTIN_WORKFLOWS: readonly WorkflowData[] = [
	{
		uuid: QUICK_TASK_WORKFLOW_UUID,
		title: "Quick Task",
		description: "A simple sequential workflow: Open -> Done.",
		states: [
			{
				name: "Open",
				isInitial: true,
				transitions: [{ signal: "complete", targetState: "Done" }],
			},
			{
				name: "Done",
				isFinal: true,
			},
		],
		availableStateNames: ["Open", "Done"],
		filters: [],
		participants: [],
		createdTime: BUILTIN_TIME,
		modifiedTime: BUILTIN_TIME,
	},
	{
		uuid: STANDARD_TASK_WORKFLOW_UUID,
		title: "Standard Task",
		description: "A sequential workflow with a working state: Open -> In Progress -> Done.",
		states: [
			{
				name: "Open",
				isInitial: true,
				transitions: [{ signal: "start", targetState: "In Progress" }],
			},
			{
				name: "In Progress",
				transitions: [{ signal: "complete", targetState: "Done" }],
			},
			{
				name: "Done",
				isFinal: true,
			},
		],
		availableStateNames: ["Open", "In Progress", "Done"],
		filters: [],
		participants: [],
		createdTime: BUILTIN_TIME,
		modifiedTime: BUILTIN_TIME,
	},
];
