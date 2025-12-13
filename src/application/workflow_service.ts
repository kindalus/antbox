import { type Either, left, right } from "shared/either.ts";
import { AntboxError, BadRequestError, ForbiddenError } from "shared/antbox_error.ts";
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
import { builtinWorkflows } from "./builtin_workflows/index.ts";

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
				new BadRequestError(
					`Node ${nodeUuid} already has a workflow instance`,
				),
			);
		}

		// Get the node that will be attached to the workflow
		const nodeOrErr = await this.#context.nodeService.get(authCtx, nodeUuid);
		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}
		const node = nodeOrErr.value;

		// Get workflow definition
		const workflowDefOrErr = await this.getWorkflowDefinition(authCtx, workflowDefinitionUuid);
		if (workflowDefOrErr.isLeft()) {
			return left(workflowDefOrErr.value);
		}

		// Check if node is locked
		if (node.locked) {
			return left(new BadRequestError(`The node ${node.uuid} is locked`));
		}

		// Check if node matches workflow filters
		const result = NodesFilters.satisfiedBy(workflowDefOrErr.value.filters, node);
		if (result.isLeft()) {
			return left(new BadRequestError(result.value.message));
		}

		// Create workflow instance
		const workflowInstance: WorkflowInstance = {
			uuid: UuidGenerator.generate(),
			nodeUuid,
			workflowDefinitionUuid,
			currentStateName: workflowDefOrErr.value.states.find((s) => s.isInitial)!.name,
			running: true,
			history: [],
		};

		// Guard for initial state
		if (!workflowInstance.currentStateName) {
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

		// Save instance
		const saveOrErr = await this.#context.workflowInstanceRepository.add(workflowInstance);
		if (saveOrErr.isLeft()) {
			// Rollback lock
			await this.#context.nodeService.unlock(authCtx, nodeUuid);
			return left(saveOrErr.value);
		}

		await this.#context.nodeService.update(authCtx, nodeUuid, {
			workflowInstanceUuid: workflowInstance.uuid,
			workflowState: workflowInstance.currentStateName,
		});
		return right(workflowInstance);
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
		const instance = instanceOrErr.value;

		// Get workflow definition
		const workflowDefOrErr = await this.getWorkflowDefinition(
			authCtx,
			instance.workflowDefinitionUuid,
		);
		if (workflowDefOrErr.isLeft()) {
			return left(workflowDefOrErr.value);
		}
		const workflowDef = workflowDefOrErr.value;

		// Get the node that will be attached to the workflow
		const nodeOrErr = await this.#context.nodeService.get(authCtx, nodeUuid);
		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}
		const node = nodeOrErr.value;

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

		// Check if nodes can transition to new state
		const nodeSatisfies = NodesFilters.satisfiedBy(transition.filters ?? [], node);
		if (nodeSatisfies.isLeft()) {
			return left(new BadRequestError(nodeSatisfies.value.message));
		}

		// Check if the user can transition
		if (
			transition.groupsAllowed &&
			transition.groupsAllowed.some((g) => authCtx.principal.groups.includes(g))
		) {
			return left(new ForbiddenError());
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
		instance.running = !workflowDef.states.find((s) => s.name === transition.targetState)
			?.isFinal;
		// Save updated instance
		const updateOrErr = await this.#context.workflowInstanceRepository.update(instance);
		if (updateOrErr.isLeft()) {
			return left(updateOrErr.value);
		}

		// Check if we reached a final state

		if (!instance.running) {
			// Unlock the node
			await this.#context.nodeService.unlock(authCtx, nodeUuid);
			await this.#context.nodeService.update(authCtx, nodeUuid, {
				workflowState: null as unknown as string,
				workflowInstanceUuid: null as unknown as string,
			});
		} else {
			await this.#context.nodeService.update(authCtx, nodeUuid, {
				workflowState: instance.currentStateName,
			});
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
	): Promise<Either<AntboxError, WorkflowInstance[]>> {
		// Get all instances for the workflow definition (or all if not specified)

		const instancesOrErr = await this.#context.workflowInstanceRepository.findActive();

		if (instancesOrErr.isLeft()) {
			return left(instancesOrErr.value);
		}

		const instances = instancesOrErr.value;

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
		// Check if it's a builtin workflow
		if (metadata.uuid) {
			const isBuiltin = builtinWorkflows.some((w) => w.uuid === metadata.uuid);
			if (isBuiltin) {
				return left(new BadRequestError("Cannot update built-in workflow"));
			}
		}

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
		// Check builtin workflows first
		const builtinWorkflow = builtinWorkflows.find((w) => w.uuid === uuid);
		if (builtinWorkflow) {
			return right(toWorkflowDTO(builtinWorkflow));
		}

		// Check repository workflows
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
			.map((node) => toWorkflowDTO(node as WorkflowNode));

		// Merge with builtin workflows
		const builtinWorkflowDTOs = builtinWorkflows.map(toWorkflowDTO);
		const allWorkflows = [...workflows, ...builtinWorkflowDTOs]
			.sort((a, b) => a.title.localeCompare(b.title));

		return right(allWorkflows);
	}

	/**
	 * Deletes a workflow definition
	 */
	async deleteWorkflowDefinition(
		ctx: AuthenticationContext,
		uuid: string,
	): Promise<Either<AntboxError, void>> {
		// Check if it's a builtin workflow
		const isBuiltin = builtinWorkflows.some((w) => w.uuid === uuid);
		if (isBuiltin) {
			return left(new BadRequestError("Cannot delete built-in workflow"));
		}

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
