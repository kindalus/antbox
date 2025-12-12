import { Folders } from "domain/nodes/folders.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { WorkflowNode, WorkflowState } from "domain/workflows/workflow_node.ts";
import { Users } from "domain/users_groups/users.ts";

/**
 * Approval State Machine Workflow
 *
 * Pattern: Draft ⇄ ManagerReview → FinanceReview ⇄ Draft → Approved
 *
 * This is an event-driven state machine where the workflow lingers in a specific
 * state until an external action triggers a transition. Can loop back to previous
 * states for corrections.
 *
 * Use Case: Document approvals, expense reports, issue tracking, order processing
 *
 * Example (Expense Report):
 * 1. Employee creates report (Draft)
 * 2. Employee submits (→ ManagerReview)
 * 3. Manager reviews:
 *    - If rejected → back to Draft for corrections
 *    - If approved → FinanceReview
 * 4. Finance reviews:
 *    - If rejected → back to Draft
 *    - If approved → Approved (final)
 *
 * Key Feature: Rejection loops allow iterative refinement without restarting the workflow.
 */
export const STATE_MACHINE_APPROVAL_WORKFLOW_UUID = "builtin-state-machine-approval";

const states: WorkflowState[] = [
	{
		name: "Draft",
		isInitial: true,
		transitions: [
			{
				signal: "submit",
				targetState: "ManagerReview",
			},
		],
	},
	{
		name: "ManagerReview",
		transitions: [
			{
				signal: "approve",
				targetState: "FinanceReview",
			},
			{
				signal: "reject",
				targetState: "Draft",
			},
		],
	},
	{
		name: "FinanceReview",
		transitions: [
			{
				signal: "approve",
				targetState: "Approved",
			},
			{
				signal: "reject",
				targetState: "Draft",
			},
		],
	},
	{
		name: "Approved",
		isFinal: true,
	},
];

export const STATE_MACHINE_APPROVAL_WORKFLOW = new WorkflowNode({
	uuid: STATE_MACHINE_APPROVAL_WORKFLOW_UUID,
	title: "Approval State Machine",
	description:
		"An event-driven state machine for multi-level approval processes. Supports rejection loops where items can return to draft for corrections. Ideal for expense reports, document approvals, and any process requiring hierarchical review.",
	mimetype: Nodes.WORKFLOW_MIMETYPE,
	parent: Folders.WORKFLOWS_FOLDER_UUID,
	owner: Users.ROOT_USER_EMAIL,
	states,
	availableStateNames: states.map((s) => s.name),
	filters: [],
});
