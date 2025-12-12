import { type Either, left, right } from "shared/either.ts";
import { AntboxError, BadRequestError } from "shared/antbox_error.ts";
import type { WorkflowServiceContext } from "./workflow_service_context.ts";
import type { AuthenticationContext } from "./authentication_context.ts";
import type {
	WorkflowInstance,
	WorkflowTransitionHistory,
} from "domain/workflows/workflow_instance.ts";
import { UuidGenerator } from "shared/uuid_generator.ts";
import { WorkflowNode } from "domain/workflows/workflow_node.ts";
import { toWorkflowDTO, WorkflowDTO } from "./workflow_dto.ts";
import { Folders } from "domain/nodes/folders.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";
import { NodeMetadata } from "domain/nodes/node_metadata.ts";
import { Context } from "@oak/oak";
import { NodesFilters } from "domain/nodes_filters.ts";

export class WorkflowService {
	#context: WorkflowServiceContext;

	constructor(context: WorkflowServiceContext) {
		this.#context = context;
	}

	async startWorkflow(
		authCtx: AuthenticationContext,
		nodeUuid: string,
		workflowDefinitionUuid: string,
	): Promise<Either<AntboxError, WorkflowInstance>> {
		// Check if node already has a workflow instance
		const existingInstanceOrErr = await this.#context.workflowInstanceRepository.getByNodeUuid(
			nodeUuid,
		);
		if (existingInstanceOrErr.isRight()) {
			return left(
				new AntboxError(
					"WorkflowAlreadyExists",
					`Node ${nodeUuid} already has a workflow instance`,
				),
			);
		}

		// Get the node that will be attached to the workflow
		const nodeOrErr = await this.#context.nodeService.get(authCtx, nodeUuid);
		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}
		const node = nodeOrErr.right;

		// Get workflow definition
		const workflowDefOrErr = await this.#context.nodeService.get(authCtx, workflowDefinitionUuid);
		if (workflowDefOrErr.isLeft()) {
			return left(workflowDefOrErr.value);
		}

		// Verify it's a workflow node and create instance
		let workflowDef: WorkflowNode;
		try {
			workflowDef = new WorkflowNode(workflowDefOrErr.right.metadata);
		} catch (error) {
			return left(
				new AntboxError(
					"InvalidWorkflowDefinition",
					`Node ${workflowDefinitionUuid} is not a valid workflow definition: ${
						(error as Error).message
					}`,
				),
			);
		}

		// Check if node matches workflow filters
		if (workflowDef.filters && workflowDef.filters.length > 0) {
			const matchResult = NodesFilters.satisfiedBy(workflowDef.filters, node);
			if (matchResult.isLeft()) {
				return left(
					new AntboxError(
						"NodeNotEligibleForWorkflow",
						`Node ${nodeUuid} does not match the workflow definition filters`,
					),
				);
			}
		}

		// Get initial state
		const initialState = workflowDef.states.find((s) => s.isInitial === true);
		if (!initialState) {
			return left(
				new AntboxError(
					"NoInitialState",
					`Workflow ${workflowDefinitionUuid} has no initial state`,
				),
			);
		}

		// Lock the node
		const lockOrErr = await this.#context.nodeService.lock(
			authCtx,
			nodeUuid,
			[], // No unlock groups - only workflow can unlock
		);

		if (lockOrErr.isLeft()) {
			return left(lockOrErr.value);
		}

		// Create workflow instance
		const instance: WorkflowInstance = {
			uuid: UuidGenerator.generate(),
			workflowDefinitionUuid,
			nodeUuid,
			currentStateName: initialState.name,
			history: [],
		};

		// Save instance
		const saveOrErr = await this.#context.workflowInstanceRepository.add(instance);
		if (saveOrErr.isLeft()) {
			// Rollback lock
			await this.#context.nodeService.unlock(authCtx, nodeUuid);
			return left(saveOrErr.value);
		}

		return right(instance);
	}

	async transition(
		authCtx: AuthenticationContext,
		nodeUuid: string,
		signal: string,
		message?: string,
	): Promise<Either<AntboxError, WorkflowInstance>> {
		// Get workflow instance
		const instanceOrErr = await this.#context.workflowInstanceRepository.getByNodeUuid(nodeUuid);
		if (instanceOrErr.isLeft()) {
			return left(instanceOrErr.value);
		}

		const instance = instanceOrErr.right;

		// Get workflow definition
		const workflowDefOrErr = await this.#context.nodeService.get(
			authCtx,
			instance.workflowDefinitionUuid,
		);
		if (workflowDefOrErr.isLeft()) {
			return left(workflowDefOrErr.value);
		}

		let workflowDef: WorkflowNode;
		try {
			workflowDef = new WorkflowNode(workflowDefOrErr.right.metadata);
		} catch (error) {
			return left(
				new AntboxError(
					"InvalidWorkflowDefinition",
					`Workflow definition is invalid: ${(error as Error).message}`,
				),
			);
		}

		// Find current state
		const currentState = workflowDef.states.find((s) => s.name === instance.currentStateName);
		if (!currentState) {
			return left(
				new AntboxError(
					"InvalidState",
					`Current state ${instance.currentStateName} not found in workflow definition`,
				),
			);
		}

		// Find transition
		const transition = currentState.transitions?.find((t) => t.signal === signal);
		if (!transition) {
			return left(
				new AntboxError(
					"InvalidSignal",
					`Invalid signal ${signal} for state ${instance.currentStateName}`,
				),
			);
		}

		// Create history entry
		const historyEntry: WorkflowTransitionHistory = {
			from: instance.currentStateName,
			to: transition.targetState,
			signal,
			timestamp: new Date(),
			user: authCtx.principal.email,
			message,
		};

		// Update instance
		instance.currentStateName = transition.targetState;
		instance.history = [...(instance.history || []), historyEntry];

		// Save updated instance
		const updateOrErr = await this.#context.workflowInstanceRepository.update(instance);
		if (updateOrErr.isLeft()) {
			return left(updateOrErr.value);
		}

		// Check if we reached a final state
		const newState = workflowDef.states.find((s) => s.name === transition.targetState);
		if (newState?.isFinal) {
			// Unlock the node
			await this.#context.nodeService.unlock(authCtx, nodeUuid);
		}

		return right(instance);
	}

	async getInstance(
		authCtx: AuthenticationContext,
		nodeUuid: string,
	): Promise<Either<AntboxError, WorkflowInstance>> {
		// Verify user has access to the node
		const nodeOrErr = await this.#context.nodeService.get(authCtx, nodeUuid);
		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}

		return await this.#context.workflowInstanceRepository.getByNodeUuid(nodeUuid);
	}

	async findActiveInstances(
		authCtx: AuthenticationContext,
		workflowDefinitionUuid?: string,
	): Promise<Either<AntboxError, WorkflowInstance[]>> {
		// Get all instances for the workflow definition (or all if not specified)
		let instancesOrErr;
		if (workflowDefinitionUuid) {
			instancesOrErr = await this.#context.workflowInstanceRepository.findByWorkflowDefinition(
				workflowDefinitionUuid,
			);
		} else {
			instancesOrErr = await this.#context.workflowInstanceRepository.findActive();
		}

		if (instancesOrErr.isLeft()) {
			return left(instancesOrErr.value);
		}

		const instances = instancesOrErr.right;

		// Check if user is admin
		const isAdmin = authCtx.principal.groups.includes("--admins--");

		// Filter out instances in final states and check user authorization
		const activeInstances: WorkflowInstance[] = [];

		for (const instance of instances) {
			// Get workflow definition to check if current state is final
			const workflowDefOrErr = await this.#context.nodeService.get(
				authCtx,
				instance.workflowDefinitionUuid,
			);

			if (workflowDefOrErr.isRight()) {
				try {
					const workflowDef = new WorkflowNode(workflowDefOrErr.right.metadata);
					const state = workflowDef.states.find(
						(s) => s.name === instance.currentStateName,
					);

					if (state && !state.isFinal) {
						// If admin, include all active instances
						if (isAdmin) {
							activeInstances.push(instance);
						} else {
							// Check if user can perform any transition in this state
							const canTransition = this.#canUserTransitionInState(authCtx, state);
							if (canTransition) {
								activeInstances.push(instance);
							}
						}
					}
				} catch (_error) {
					// Skip invalid workflow definitions
				}
			}
		}

		return right(activeInstances);
	}

	#canUserTransitionInState(
		authCtx: AuthenticationContext,
		state: { transitions?: Array<{ groupsAllowed?: string[] }> },
	): boolean {
		if (!state.transitions || state.transitions.length === 0) {
			return false;
		}

		// Check if user can perform at least one transition
		return state.transitions.some((transition) => {
			// If no groupsAllowed specified, transition is allowed for all users
			if (!transition.groupsAllowed || transition.groupsAllowed.length === 0) {
				return true;
			}

			// Check if user belongs to any of the allowed groups
			return transition.groupsAllowed.some((allowedGroup) =>
				authCtx.principal.groups.includes(allowedGroup)
			);
		});
	}

	// ============================================================================
	// WORKFLOW DEFINITION CRUD METHODS
	// ============================================================================

	/**
	 * Creates or replaces a workflow definition
	 */
	async createOrReplaceWorkflow(
		ctx: AuthenticationContext,
		metadata: Partial<NodeMetadata>,
	): Promise<Either<AntboxError, WorkflowDTO>> {
		// Ensure proper mimetype and parent
		const workflowMetadata: Partial<NodeMetadata> = {
			...metadata,
			mimetype: Nodes.WORKFLOW_MIMETYPE,
			parent: Folders.WORKFLOWS_FOLDER_UUID,
			owner: ctx.principal.email,
		};

		// Try to get existing workflow definition
		if (metadata.uuid) {
			const existingOrErr = await this.#context.nodeService.get(ctx, metadata.uuid);

			if (existingOrErr.isRight()) {
				// Update existing workflow
				const updateOrErr = await this.#context.nodeService.update(
					ctx,
					metadata.uuid,
					workflowMetadata,
				);

				if (updateOrErr.isLeft()) {
					return left(updateOrErr.value);
				}

				return this.getWorkflowDefinition(ctx, metadata.uuid);
			}
		}

		// Create new workflow
		const createOrErr = await this.#context.nodeService.create(ctx, workflowMetadata);

		if (createOrErr.isLeft()) {
			return left(createOrErr.value);
		}

		const node = createOrErr.value;

		// Verify it's a workflow node
		if (!Nodes.isWorkflow(node)) {
			return left(
				new BadRequestError("Created node is not a valid workflow definition"),
			);
		}

		return right(toWorkflowDTO(node as WorkflowNode));
	}

	/**
	 * Gets a workflow definition by UUID
	 */
	async getWorkflowDefinition(
		ctx: AuthenticationContext,
		uuid: string,
	): Promise<Either<AntboxError, WorkflowDTO>> {
		const nodeOrErr = await this.#context.nodeService.get(ctx, uuid);

		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}

		const node = nodeOrErr.value;

		if (!Nodes.isWorkflow(node)) {
			return left(
				new NodeNotFoundError(`Node ${uuid} is not a workflow definition`),
			);
		}

		return right(toWorkflowDTO(node as WorkflowNode));
	}

	/**
	 * Lists all workflow definitions
	 */
	async listWorkflowDefinitions(
		ctx: AuthenticationContext,
	): Promise<Either<AntboxError, WorkflowDTO[]>> {
		const nodesOrErr = await this.#context.nodeService.find(
			ctx,
			[
				["mimetype", "==", Nodes.WORKFLOW_MIMETYPE],
				["parent", "==", Folders.WORKFLOWS_FOLDER_UUID],
			],
			Number.MAX_SAFE_INTEGER,
		);

		if (nodesOrErr.isLeft()) {
			return left(nodesOrErr.value);
		}

		const workflows = nodesOrErr.value.nodes
			.filter((node) => Nodes.isWorkflow(node))
			.map((node) => toWorkflowDTO(node as WorkflowNode))
			.sort((a, b) => a.title.localeCompare(b.title));

		return right(workflows);
	}

	/**
	 * Deletes a workflow definition
	 */
	async deleteWorkflowDefinition(
		ctx: AuthenticationContext,
		uuid: string,
	): Promise<Either<AntboxError, void>> {
		// Verify it's a workflow definition
		const workflowOrErr = await this.getWorkflowDefinition(ctx, uuid);

		if (workflowOrErr.isLeft()) {
			return left(workflowOrErr.value);
		}

		// Check if there are any active instances using this workflow
		const instancesOrErr = await this.#context.workflowInstanceRepository
			.findByWorkflowDefinition(
				uuid,
			);

		if (instancesOrErr.isRight() && instancesOrErr.value.length > 0) {
			return left(
				new BadRequestError(
					`Cannot delete workflow definition: ${instancesOrErr.value.length} active instance(s) exist`,
				),
			);
		}

		// Delete the workflow definition node
		return await this.#context.nodeService.delete(ctx, uuid);
	}

	/**
	 * Exports a workflow definition as JSON
	 */
	async exportWorkflowDefinition(
		ctx: AuthenticationContext,
		uuid: string,
	): Promise<Either<AntboxError, WorkflowDTO>> {
		return this.getWorkflowDefinition(ctx, uuid);
	}
}
