import { WorkflowNode, WorkflowState } from "domain/workflows/workflow_node.ts";
import { Folders } from "domain/nodes/folders.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { Users } from "domain/users_groups/users.ts";

/**
 * Sequential Pipeline Workflow
 *
 * Pattern: Start → Step1 → Step2 → Step3 → End
 *
 * This is the most basic workflow pattern where tasks execute one after another
 * in a straight line. Each step must complete before the next begins.
 *
 * Use Case: Data processing pipelines, simple approval chains, installation wizards
 *
 * Example:
 * 1. User submits a form (Start)
 * 2. System validates the data (Step1)
 * 3. System saves data to database (Step2)
 * 4. System sends confirmation email (Step3)
 * 5. Complete (End)
 */
export const SEQUENTIAL_PIPELINE_WORKFLOW_UUID = "builtin-sequential-pipeline";

const states: WorkflowState[] = [
	{
		name: "Start",
		isInitial: true,
		transitions: [
			{
				signal: "begin",
				targetState: "Step1",
			},
		],
	},
	{
		name: "Step1",
		transitions: [
			{
				signal: "next",
				targetState: "Step2",
			},
		],
	},
	{
		name: "Step2",
		transitions: [
			{
				signal: "next",
				targetState: "Step3",
			},
		],
	},
	{
		name: "Step3",
		transitions: [
			{
				signal: "complete",
				targetState: "End",
			},
		],
	},
	{
		name: "End",
		isFinal: true,
	},
];

export const SEQUENTIAL_PIPELINE_WORKFLOW = new WorkflowNode({
	uuid: SEQUENTIAL_PIPELINE_WORKFLOW_UUID,
	title: "Sequential Pipeline",
	description:
		"A linear workflow where tasks execute one after another. Each step must complete before the next begins. Ideal for simple processes like form submission → validation → storage → notification.",
	mimetype: Nodes.WORKFLOW_MIMETYPE,
	parent: Folders.WORKFLOWS_FOLDER_UUID,
	owner: Users.ROOT_USER_EMAIL,

	states,
	availableStateNames: states.map((s) => s.name),
	filters: [], // Applies to all nodes
});
