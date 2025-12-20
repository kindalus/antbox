import { WorkflowNode, WorkflowState } from "domain/workflows/workflow_node.ts";
import { Folders } from "domain/nodes/folders.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { Users } from "domain/users_groups/users.ts";

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

export const QUICK_TASK_WORKFLOW = new WorkflowNode({
	uuid: QUICK_TASK_WORKFLOW_UUID,
	title: "Quick Task",
	description: "A simple sequential workflow: Open → Done.",
	mimetype: Nodes.WORKFLOW_MIMETYPE,
	parent: Folders.WORKFLOWS_FOLDER_UUID,
	owner: Users.ROOT_USER_EMAIL,

	states,
	availableStateNames: states.map((s) => s.name),
	filters: [], // Applies to all nodes
});
