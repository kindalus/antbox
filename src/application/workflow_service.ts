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
import { NodesFilters } from "domain/nodes_filters.ts";
import { builtinWorkflows } from "./builtin_workflows/index.ts";
import type { NodeLike } from "domain/node_like.ts";
import { toWorkflowInstanceDTO, type WorkflowInstanceDTO } from "./workflow_instance_dto.ts";

export class WorkflowService {
	#context: WorkflowServiceContext;

	constructor(context: WorkflowServiceContext) {
		this.#context = context;
	}

	async startWorkflow(
		authCtx: AuthenticationContext,
		nodeUuid: string,
		workflowDefinitionUuid: string,
		groupsAllowedOverride?: string[],
	): Promise<Either<AntboxError, WorkflowInstanceDTO>> {
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
		const result = NodesFilters.satisfiedBy(
			workflowDefOrErr.value.filters,
			node as unknown as NodeLike,
		);
		if (result.isLeft()) {
			return left(new BadRequestError(result.value.message));
		}

		// Create workflow instance (store a snapshot so later workflow definition edits don't affect it)
		const workflowDefinitionSnapshot = structuredClone({
			uuid: workflowDefOrErr.value.uuid,
			title: workflowDefOrErr.value.title,
			description: workflowDefOrErr.value.description,
			createdTime: workflowDefOrErr.value.createdTime,
			modifiedTime: workflowDefOrErr.value.modifiedTime,
			states: workflowDefOrErr.value.states,
			availableStateNames: workflowDefOrErr.value.availableStateNames,
			groupsAllowed: workflowDefOrErr.value.groupsAllowed,
		});
		const workflowInstance: WorkflowInstance = {
			uuid: UuidGenerator.generate(),
			nodeUuid,
			workflowDefinitionUuid,
			workflowDefinition: workflowDefinitionSnapshot,
			currentStateName: workflowDefOrErr.value.states.find((s) => s.isInitial)!.name,
			running: true,
			cancelled: false,
			history: [],
			groupsAllowed: groupsAllowedOverride ?? workflowDefOrErr.value.groupsAllowed,
			owner: authCtx.principal.email,
			startedTime: new Date().toISOString(),
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
		return right(toWorkflowInstanceDTO(workflowInstance));
	}

	async transition(
		authCtx: AuthenticationContext,
		nodeUuid: string,
		signal: string,
		message?: string,
	): Promise<Either<AntboxError, WorkflowInstanceDTO>> {
		// Get workflow instance
		const instanceOrErr = await this.#context.workflowInstanceRepository.getByNodeUuid(nodeUuid);
		if (instanceOrErr.isLeft()) {
			return left(instanceOrErr.value);
		}
		const instance = instanceOrErr.value;

		// Check if user is allowed to access this instance
		if (!this.#canUserAccessInstance(authCtx, instance)) {
			return left(new ForbiddenError());
		}

		// Check if instance is cancelled
		if (instance.cancelled) {
			return left(new BadRequestError("Cannot transition a cancelled workflow instance"));
		}

		// Resolve workflow definition snapshot (prefer instance snapshot so mid-flight definition
		// edits don't affect the running instance).
		let workflowDef = instance.workflowDefinition;
		if (!workflowDef) {
			const workflowDefOrErr = await this.getWorkflowDefinition(
				authCtx,
				instance.workflowDefinitionUuid,
			);
			if (workflowDefOrErr.isLeft()) {
				return left(workflowDefOrErr.value);
			}

			workflowDef = structuredClone({
				uuid: workflowDefOrErr.value.uuid,
				title: workflowDefOrErr.value.title,
				description: workflowDefOrErr.value.description,
				createdTime: workflowDefOrErr.value.createdTime,
				modifiedTime: workflowDefOrErr.value.modifiedTime,
				states: workflowDefOrErr.value.states,
				availableStateNames: workflowDefOrErr.value.availableStateNames,
				groupsAllowed: workflowDefOrErr.value.groupsAllowed,
			});

			instance.workflowDefinition = workflowDef;

			// Backfill groupsAllowed if missing
			if (!instance.groupsAllowed) {
				instance.groupsAllowed = workflowDefOrErr.value.groupsAllowed;
			}
		}

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
		const nodeSatisfies = NodesFilters.satisfiedBy(
			transition.filters ?? [],
			node as unknown as NodeLike,
		);
		if (nodeSatisfies.isLeft()) {
			return left(new BadRequestError(nodeSatisfies.value.message));
		}

		// Check if the user can transition
		if (transition.groupsAllowed && transition.groupsAllowed.length > 0) {
			const isInAllowedGroup = transition.groupsAllowed.some((g) =>
				authCtx.principal.groups.includes(g)
			);
			if (!isInAllowedGroup) {
				return left(new ForbiddenError());
			}
		}

		// Find target state
		const targetState = workflowDef.states.find((s) => s.name === transition.targetState);
		if (!targetState) {
			return left(
				new AntboxError(
					"InvalidState",
					`Target state ${transition.targetState} not found in workflow definition`,
				),
			);
		}

		// Execute actions in order: onExit → transition actions → onEnter
		const onExitActions = currentState.onExit ?? [];
		const transitionActions = transition.actions ?? [];
		const onEnterActions = targetState.onEnter ?? [];

		const allActions = [...onExitActions, ...transitionActions, ...onEnterActions];

		if (allActions.length > 0) {
			const executeResult = await this.#executeActions(allActions, authCtx, nodeUuid);
			if (executeResult.isLeft()) {
				return left(executeResult.value);
			}
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
		instance.running = !targetState.isFinal;

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

		return right(toWorkflowInstanceDTO(instance));
	}

	async cancelWorkflow(
		authCtx: AuthenticationContext,
		nodeUuid: string,
	): Promise<Either<AntboxError, WorkflowInstanceDTO>> {
		// Get workflow instance
		const instanceOrErr = await this.#context.workflowInstanceRepository.getByNodeUuid(nodeUuid);
		if (instanceOrErr.isLeft()) {
			return left(instanceOrErr.value);
		}
		const instance = instanceOrErr.value;

		// Check if user is allowed to cancel this instance
		// Only the owner or admins can cancel
		const isAdmin = authCtx.principal.groups.includes("--admins--");
		const isOwner = instance.owner === authCtx.principal.email;

		if (!isAdmin && !isOwner) {
			return left(new ForbiddenError());
		}

		// Check if instance is already cancelled or finished
		if (instance.cancelled) {
			return left(new BadRequestError("Workflow instance is already cancelled"));
		}

		if (!instance.running) {
			return left(new BadRequestError("Workflow instance is not running"));
		}

		// Mark as cancelled
		instance.cancelled = true;
		instance.running = false;

		// Save updated instance
		const updateOrErr = await this.#context.workflowInstanceRepository.update(instance);
		if (updateOrErr.isLeft()) {
			return left(updateOrErr.value);
		}

		// Unlock the node
		await this.#context.nodeService.unlock(authCtx, nodeUuid);
		await this.#context.nodeService.update(authCtx, nodeUuid, {
			workflowState: null as unknown as string,
			workflowInstanceUuid: null as unknown as string,
		});

		return right(toWorkflowInstanceDTO(instance));
	}

	async getInstance(
		authCtx: AuthenticationContext,
		nodeUuid: string,
	): Promise<Either<AntboxError, WorkflowInstanceDTO>> {
		// Verify user has access to the node
		const nodeOrErr = await this.#context.nodeService.get(authCtx, nodeUuid);
		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}

		const instanceOrErr = await this.#context.workflowInstanceRepository.getByNodeUuid(nodeUuid);
		if (instanceOrErr.isLeft()) {
			return left(instanceOrErr.value);
		}

		const instance = instanceOrErr.value;

		// Check if user is allowed to view this instance
		if (!this.#canUserAccessInstance(authCtx, instance)) {
			return left(new ForbiddenError());
		}

		// Best-effort backfill for instances created before snapshots existed.
		if (!instance.workflowDefinition) {
			const workflowDefOrErr = await this.getWorkflowDefinition(
				authCtx,
				instance.workflowDefinitionUuid,
			);
			if (workflowDefOrErr.isRight()) {
				instance.workflowDefinition = structuredClone({
					uuid: workflowDefOrErr.value.uuid,
					title: workflowDefOrErr.value.title,
					description: workflowDefOrErr.value.description,
					createdTime: workflowDefOrErr.value.createdTime,
					modifiedTime: workflowDefOrErr.value.modifiedTime,
					states: workflowDefOrErr.value.states,
					availableStateNames: workflowDefOrErr.value.availableStateNames,
					groupsAllowed: workflowDefOrErr.value.groupsAllowed,
				});

				// Backfill groupsAllowed if missing
				if (!instance.groupsAllowed) {
					instance.groupsAllowed = workflowDefOrErr.value.groupsAllowed;
				}

				// Ignore backfill failures; the instance is still returned.
				await this.#context.workflowInstanceRepository.update(instance);
			}
		}

		return right(toWorkflowInstanceDTO(instance));
	}

	async findActiveInstances(
		authCtx: AuthenticationContext,
		workflowDefinitionUuid?: string,
	): Promise<Either<AntboxError, WorkflowInstanceDTO[]>> {
		// Get all instances for the workflow definition (or all if not specified)

		const instancesOrErr = await this.#context.workflowInstanceRepository.findActive(
			workflowDefinitionUuid,
		);

		if (instancesOrErr.isLeft()) {
			return left(instancesOrErr.value);
		}

		let instances = instancesOrErr.value;

		if (workflowDefinitionUuid) {
			instances = instances.filter((i) => i.workflowDefinitionUuid === workflowDefinitionUuid);
		}

		// Some repositories return all instances here; filter at the service layer.
		instances = instances.filter((i) => i.running);

		// Check if user is admin
		const isAdmin = authCtx.principal.groups.includes("--admins--");

		// Filter out instances in final states and check user authorization
		const activeInstances: WorkflowInstance[] = [];

		for (const instance of instances) {
			// Check if user is allowed to access this instance
			if (!this.#canUserAccessInstance(authCtx, instance)) {
				continue;
			}

			// If admin, include all running instances without needing the workflow definition.
			if (isAdmin) {
				activeInstances.push(instance);
				continue;
			}

			// Prefer the instance's embedded snapshot (definition edits shouldn't affect visibility).
			let workflowDef = instance.workflowDefinition;

			// Backwards compatibility: if missing, attempt to load it (may fail due to permissions).
			if (!workflowDef) {
				const workflowDefOrErr = await this.getWorkflowDefinition(
					authCtx,
					instance.workflowDefinitionUuid,
				);
				if (workflowDefOrErr.isLeft()) {
					continue;
				}

				workflowDef = workflowDefOrErr.value;
			}

			const state = workflowDef.states.find((s) => s.name === instance.currentStateName);
			if (!state || state.isFinal) {
				continue;
			}

			// Check if user can perform any transition in this state
			const canTransition = this.#canUserTransitionInState(authCtx, state);
			if (canTransition) {
				activeInstances.push(instance);
			}
		}

		return right(activeInstances.map(toWorkflowInstanceDTO));
	}

	#canUserAccessInstance(
		authCtx: AuthenticationContext,
		instance: WorkflowInstance,
	): boolean {
		// Admins can access all instances
		if (authCtx.principal.groups.includes("--admins--")) {
			return true;
		}

		// If no groupsAllowed specified, all users can access
		if (!instance.groupsAllowed || instance.groupsAllowed.length === 0) {
			return true;
		}

		// Check if user belongs to any of the allowed groups
		return instance.groupsAllowed.some((allowedGroup) =>
			authCtx.principal.groups.includes(allowedGroup)
		);
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

	/**
	 * Parse action string in the format: "[action_uuid] [param]=[value]"
	 * Example: "rename new_name='New Name'"
	 *
	 * @param actionString - The action string to parse
	 * @returns Object with action UUID and parameters
	 */
	#parseAction(actionString: string): {
		actionUuid: string;
		params: Record<string, unknown>;
	} {
		const trimmed = actionString.trim();

		// Split by first space to separate action UUID from parameters
		const firstSpaceIndex = trimmed.indexOf(" ");

		if (firstSpaceIndex === -1) {
			// No parameters, just action UUID
			return {
				actionUuid: trimmed,
				params: {},
			};
		}

		const actionUuid = trimmed.substring(0, firstSpaceIndex);
		const paramsString = trimmed.substring(firstSpaceIndex + 1).trim();

		// Parse parameters: key=value key2='value with spaces'
		const params: Record<string, unknown> = {};

		// Match pattern: word=value or word='value' or word="value"
		const paramRegex = /(\w+)=(?:'([^']*)'|"([^"]*)"|([^\s]+))/g;
		let match;

		while ((match = paramRegex.exec(paramsString)) !== null) {
			const key = match[1];
			// Use the first non-undefined capture group (quoted or unquoted value)
			const value = match[2] ?? match[3] ?? match[4];
			params[key] = value;
		}

		return { actionUuid, params };
	}

	/**
	 * Execute a list of actions on a node
	 *
	 * @param actions - Array of action strings in format: "[action_uuid] [param]=[value]"
	 * @param authCtx - Authentication context
	 * @param nodeUuid - UUID of the node to execute actions on
	 * @returns Either error or void
	 */
	async #executeActions(
		actions: string[],
		authCtx: AuthenticationContext,
		nodeUuid: string,
	): Promise<Either<AntboxError, void>> {
		for (const actionString of actions) {
			const { actionUuid, params } = this.#parseAction(actionString);

			// Execute the action using FeatureService
			const result = await this.#context.featureService.runAction(
				authCtx,
				actionUuid,
				[nodeUuid],
				params,
			);

			if (result.isLeft()) {
				return left(
					new AntboxError(
						"ActionExecutionFailed",
						`Failed to execute action "${actionString}": ${result.value.message}`,
					),
				);
			}
		}

		return right(undefined);
	}

	// ============================================================================
	// WORKFLOW DEFINITION CRUD METHODS
	// ============================================================================

	/**
	 * Creates or replaces a workflow definition
	 */
	async createOrReplaceWorkflow(
		ctx: AuthenticationContext,
		metadata: NodeMetadata,
	): Promise<Either<AntboxError, WorkflowDTO>> {
		// Check if it's a builtin workflow
		if (metadata.uuid) {
			const isBuiltin = builtinWorkflows.some((w) => w.uuid === metadata.uuid);
			if (isBuiltin) {
				return left(new BadRequestError("Cannot update built-in workflow"));
			}
		}

		// Ensure proper mimetype and parent
		const workflowMetadata: NodeMetadata = {
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
		if (!Nodes.isWorkflow(node as unknown as NodeLike)) {
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

		if (!Nodes.isWorkflow(node as unknown as NodeLike)) {
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
			.filter((node) => Nodes.isWorkflow(node as unknown as NodeLike))
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
