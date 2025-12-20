import { WorkflowNode, WorkflowState } from "domain/workflows/workflow_node.ts";
import { Folders } from "domain/nodes/folders.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { Users } from "domain/users_groups/users.ts";

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

export const STANDARD_TASK_WORKFLOW = new WorkflowNode({
	uuid: STANDARD_TASK_WORKFLOW_UUID,
	title: "Standard Task",
	description: "A sequential workflow with a working state: Open → In Progress → Done.",
	mimetype: Nodes.WORKFLOW_MIMETYPE,
	parent: Folders.WORKFLOWS_FOLDER_UUID,
	owner: Users.ROOT_USER_EMAIL,

	states,
	availableStateNames: states.map((s) => s.name),
	filters: [], // Applies to all nodes
});
