import { Node } from "../nodes/node.ts";
import { NodeMetadata } from "../nodes/node_metadata.ts";
import { Nodes } from "../nodes/nodes.ts";
import { Folders } from "../nodes/folders.ts";
import { AntboxError } from "shared/antbox_error.ts";
import { Either, left, right } from "shared/either.ts";
import { ValidationError } from "shared/validation_error.ts";
import { toPropertyError } from "../validation_schemas.ts";
import z from "zod";
import { NodeFilters } from "domain/nodes/node_filter.ts";

/**
 * Defines a movement from one state to another.
 */
export interface WorkflowTransition {
	/** * The signal/event name that triggers this transition.
	 * @validation Must match a signal defined in the system's signal registry.
	 */
	signal: string;

	/** * The name of the destination state.
	 * @validation Must match a string existing in `WorkflowDefinition.availableStateNames`.
	 */
	targetState: string;

	/** * Guard Conditions:
	 * The transition is only valid if the Node satisfies these filters.
	 */
	filters?: NodeFilters;

	/** * IDs/Names of actions to execute during the transition.
	 */
	actions?: string[];

	/** * List of groups allowed to execute this transition.
	 */
	groupsAllowed?: string[];
}

/**
 * Represents a specific status in the lifecycle of the Node.
 * @validation A state cannot have both `isInitial: true` and `isFinal: true`.
 */
export interface WorkflowState {
	/** * Unique name of the state (e.g., "Draft", "In Review").
	 * @validation Must be unique within the workflow.
	 */
	name: string;

	/** * Is this where new items start?
	 */
	isInitial?: boolean;

	/** * Is the workflow complete when reaching this state?
	 */
	isFinal?: boolean;

	/** * IDs/Names of actions to execute immediately when ENTERING this state.
	 */
	onEnter?: string[];

	/** * IDs/Names of actions to execute immediately before LEAVING this state.
	 * @validation Must be undefined or empty if `isFinal` is true (Final states generally do not transition out).
	 */
	onExit?: string[];

	/** * The possible paths out of this state.
	 */
	transitions?: WorkflowTransition[];
}

const WorkflowNodeValidationSchema = z.object({
	title: z.string().min(1, "Node.title is required"),
	mimetype: z.literal(
		Nodes.WORKFLOW_MIMETYPE,
		"WorkflowNode.mimetype must be workflow",
	),
	parent: z.literal(
		Folders.WORKFLOWS_FOLDER_UUID,
		"WorkflowNode.parent must be workflows folder",
	),
	states: z.array(z.any()).min(1, "WorkflowNode.states must be non-empty"),
	availableStateNames: z.array(z.string()).min(
		1,
		"WorkflowNode.availableStateNames must be non-empty",
	),
	filters: z.array(z.any()).optional(),
});

export class WorkflowNode extends Node {
	readonly states: WorkflowState[];
	readonly availableStateNames: string[];
	readonly filters: NodeFilters;
	readonly groupsAllowed: string[];

	constructor(metadata: Partial<NodeMetadata>) {
		super({
			...metadata,
			mimetype: Nodes.WORKFLOW_MIMETYPE,
			parent: Folders.WORKFLOWS_FOLDER_UUID,
		});

		this.states = metadata.states ?? [];
		this.availableStateNames = metadata.availableStateNames ?? [];
		this.filters = metadata.filters ?? [];
		this.groupsAllowed = metadata.groupsAllowed ?? [];

		this._validateWorkflowNode();
	}

	override update(
		metadata: Partial<NodeMetadata>,
	): Either<ValidationError, void> {
		super.update({
			...metadata,
			mimetype: Nodes.WORKFLOW_MIMETYPE,
			parent: Folders.WORKFLOWS_FOLDER_UUID,
		});

		try {
			this._validateWorkflowNode();
		} catch (e) {
			return left(e as ValidationError);
		}

		return right(undefined);
	}

	override get metadata(): NodeMetadata {
		return {
			...super.metadata,
			mimetype: Nodes.WORKFLOW_MIMETYPE,
			parent: Folders.WORKFLOWS_FOLDER_UUID,
			states: this.states,
			availableStateNames: this.availableStateNames,
			filters: this.filters,
			groupsAllowed: this.groupsAllowed,
		};
	}

	static create(
		metadata: Partial<NodeMetadata>,
	): Either<ValidationError, WorkflowNode> {
		if (!metadata.title) {
			return left(
				ValidationError.from(
					new AntboxError("ValidationError", "Title is required"),
				),
			);
		}

		try {
			const node = new WorkflowNode(metadata);
			return right(node);
		} catch (error) {
			return left(
				ValidationError.from(
					new AntboxError("ValidationError", (error as Error).message),
				),
			);
		}
	}

	protected _validateWorkflowNode(): void {
		const errors: AntboxError[] = [];

		const nodeErrors = super._safeValidateNode();
		if (nodeErrors) {
			errors.push(...nodeErrors.errors);
		}

		const workflowErrors = WorkflowNodeValidationSchema.safeParse(this.metadata);
		if (!workflowErrors.success) {
			errors.push(
				...(workflowErrors.error.issues.map(toPropertyError("WorkflowNode"))),
			);
		}

		try {
			this._validateWorkflowLogic();
		} catch (e) {
			errors.push(
				new AntboxError("ValidationError", (e as Error).message),
			);
		}

		if (errors.length) {
			throw ValidationError.from(...errors);
		}
	}

	private _validateWorkflowLogic() {
		// 1. Check if all states listed in availableStateNames actually exist
		// 2. Iterate through states:
		this.states.forEach((state) => {
			// Enforce: State cannot be both initial and final
			if (state.isInitial && state.isFinal) {
				throw new Error(`State '${state.name}' cannot be both Initial and Final.`);
			}

			// Enforce: Final state cannot have onExit actions
			if (state.isFinal && state.onExit && state.onExit.length > 0) {
				throw new Error(`Final state '${state.name}' cannot have onExit actions.`);
			}

			// Check transitions
			if (state.transitions) {
				state.transitions.forEach((t) => {
					// Enforce: Target state must exist
					if (!this.availableStateNames.includes(t.targetState)) {
						throw new Error(
							`Transition target '${t.targetState}' is not a valid state.`,
						);
					}
				});
			}
		});
	}
}
