import { Folders } from "domain/nodes/folders.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { Users } from "domain/users_groups/users.ts";
import { WorkflowNode, WorkflowState } from "domain/workflows/workflow_node.ts";

/**
 * Parallel Split-Join Workflow
 *
 * Pattern: Start → Split → (TaskA AND TaskB) → Join → End
 *
 * This pattern splits into multiple independent tasks that can execute simultaneously.
 * The workflow waits for all branches to complete before proceeding.
 *
 * Use Case: Onboarding processes, parallel data processing, multi-department coordination
 *
 * Example (Employee Onboarding):
 * 1. Start onboarding (Start)
 * 2. Split into parallel tasks (Split)
 *    - Branch A: IT sets up email account
 *    - Branch B: Facilities prepares desk keycard
 * 3. Wait for both tasks (WaitingForA/WaitingForB)
 * 4. Both complete (Joined)
 * 5. Send welcome email (End)
 *
 * Implementation Note: Since this is a state machine, true parallelism is conceptual.
 * The workflow tracks completion of both tasks before proceeding.
 */
export const PARALLEL_SPLIT_JOIN_WORKFLOW_UUID = "builtin-parallel-split-join";

const states: WorkflowState[] = [
	{
		name: "Start",
		isInitial: true,
		transitions: [
			{
				signal: "split",
				targetState: "ParallelExecution",
			},
		],
	},
	{
		name: "ParallelExecution",
		transitions: [
			{
				signal: "taskAComplete",
				targetState: "WaitingForB",
			},
			{
				signal: "taskBComplete",
				targetState: "WaitingForA",
			},
			{
				signal: "bothComplete",
				targetState: "Joined",
			},
		],
	},
	{
		name: "WaitingForA",
		transitions: [
			{
				signal: "taskAComplete",
				targetState: "Joined",
			},
		],
	},
	{
		name: "WaitingForB",
		transitions: [
			{
				signal: "taskBComplete",
				targetState: "Joined",
			},
		],
	},
	{
		name: "Joined",
		transitions: [
			{
				signal: "continue",
				targetState: "End",
			},
		],
	},
	{
		name: "End",
		isFinal: true,
	},
];

export const PARALLEL_SPLIT_JOIN_WORKFLOW = new WorkflowNode({
	uuid: PARALLEL_SPLIT_JOIN_WORKFLOW_UUID,
	title: "Parallel Split-Join",
	description:
		"A workflow that splits into parallel tasks (A and B) and waits for both to complete before continuing. Ideal for processes where multiple independent tasks need to happen simultaneously to save time.",
	mimetype: Nodes.WORKFLOW_MIMETYPE,
	parent: Folders.WORKFLOWS_FOLDER_UUID,
	owner: Users.ROOT_USER_EMAIL,

	states,
	availableStateNames: states.map((s) => s.name),
	filters: [],
});
