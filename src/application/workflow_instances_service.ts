import type { AntboxError } from "shared/antbox_error.ts";
import { BadRequestError, ForbiddenError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import type { AuthenticationContext } from "./authentication_context.ts";
import type { ConfigurationRepository } from "domain/configuration/configuration_repository.ts";
import type {
	WorkflowDefinitionSnapshot,
	WorkflowInstanceData,
	WorkflowTransitionHistory,
} from "domain/configuration/workflow_instance_data.ts";
import { ADMINS_GROUP_UUID } from "domain/configuration/builtin_groups.ts";
import { BUILTIN_WORKFLOW_INSTANCES } from "domain/configuration/builtin_workflow_instances.ts";
import { UuidGenerator } from "shared/uuid_generator.ts";
import type { NodeService } from "./node_service.ts";
import type { FeaturesService } from "./features_service.ts";
import type { WorkflowsService } from "./workflows_service.ts";
import type { NodeLike } from "domain/node_like.ts";
import { NodesFilters } from "domain/nodes_filters.ts";
import { Users } from "domain/users_groups/users.ts";
import { Groups } from "domain/users_groups/groups.ts";
import type { NodeMetadata } from "domain/nodes/node_metadata.ts";

/**
 * WorkflowInstancesService - Manages workflow instances and their execution
 *
 * This service handles both:
 * 1. CRUD operations for workflow instance data
 * 2. Workflow execution logic (starting workflows, transitions, cancellation)
 */
export class WorkflowInstancesService {
	constructor(
		private readonly configRepo: ConfigurationRepository,
		private readonly nodeService: NodeService,
		private readonly workflowsService: WorkflowsService,
		private readonly featuresService: FeaturesService,
	) {}

	// ============================================================================
	// WORKFLOW EXECUTION METHODS
	// ============================================================================

	async startWorkflow(
		authCtx: AuthenticationContext,
		nodeUuid: string,
		workflowDefinitionUuid: string,
		groupsAllowedOverride?: string[],
	): Promise<Either<AntboxError, WorkflowInstanceData>> {
		// Check if node already has a workflow instance
		const existingInstanceOrErr = await this.getWorkflowInstanceByNodeUuid(authCtx, nodeUuid);
		if (existingInstanceOrErr.isRight()) {
			return left(
				new BadRequestError(
					`Node ${nodeUuid} already has a workflow instance`,
				),
			);
		}

		// Get the node that will be attached to the workflow
		const nodeOrErr = await this.nodeService.get(authCtx, nodeUuid);
		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}
		const node = nodeOrErr.value;

		// Get workflow definition
		const workflowDefOrErr = await this.workflowsService.getWorkflow(
			authCtx,
			workflowDefinitionUuid,
		);
		if (workflowDefOrErr.isLeft()) {
			return left(workflowDefOrErr.value);
		}
		const workflowDef = workflowDefOrErr.value;

		// Check if node is locked
		if (node.locked) {
			return left(new BadRequestError(`The node ${node.uuid} is locked`));
		}

		// Check if node matches workflow filters
		const result = NodesFilters.satisfiedBy(
			workflowDef.filters,
			node as unknown as NodeLike,
		);
		if (result.isLeft()) {
			return left(new BadRequestError(result.value.message));
		}

		// Find initial state
		const initialState = workflowDef.states.find((s) => s.isInitial);
		if (!initialState) {
			return left(
				new BadRequestError(
					`Workflow ${workflowDefinitionUuid} has no initial state`,
				),
			);
		}

		// Create workflow instance (store a snapshot so later workflow definition edits don't affect it)
		const workflowDefinitionSnapshot: WorkflowDefinitionSnapshot = {
			uuid: workflowDef.uuid,
			title: workflowDef.title,
			description: workflowDef.description || "",
			createdTime: workflowDef.createdTime,
			modifiedTime: workflowDef.modifiedTime,
			states: workflowDef.states,
			availableStateNames: workflowDef.availableStateNames,
			groupsAllowed: workflowDef.groupsAllowed,
		};

		const now = new Date().toISOString();
		const workflowInstance: WorkflowInstanceData = {
			uuid: UuidGenerator.generate(),
			nodeUuid,
			workflowDefinitionUuid,
			workflowDefinition: workflowDefinitionSnapshot,
			currentStateName: initialState.name,
			running: true,
			cancelled: false,
			history: [],
			groupsAllowed: groupsAllowedOverride ?? workflowDef.groupsAllowed,
			owner: authCtx.principal.email,
			startedTime: now,
			modifiedTime: now,
		};

		// Lock the node
		const lockOrErr = await this.nodeService.lock(
			authCtx,
			nodeUuid,
			[], // No unlock groups - only workflow can unlock
		);

		if (lockOrErr.isLeft()) {
			return left(lockOrErr.value);
		}

		// Save instance
		const saveOrErr = await this.configRepo.save("workflowInstances", workflowInstance);
		if (saveOrErr.isLeft()) {
			// Rollback lock
			await this.nodeService.unlock(authCtx, nodeUuid);
			return left(saveOrErr.value);
		}

		await this.nodeService.update(authCtx, nodeUuid, {
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
	): Promise<Either<AntboxError, WorkflowInstanceData>> {
		// Get workflow instance
		const instanceOrErr = await this.getWorkflowInstanceByNodeUuid(authCtx, nodeUuid);
		if (instanceOrErr.isLeft()) {
			return left(instanceOrErr.value);
		}
		let instance = instanceOrErr.value;

		// Check if user is allowed to access this instance
		if (!this.#hasPermission(authCtx, instance.groupsAllowed)) {
			return left(new ForbiddenError());
		}

		// Check if instance is cancelled
		if (instance.cancelled) {
			return left(new BadRequestError("Cannot transition a cancelled workflow instance"));
		}

		// Resolve workflow definition snapshot
		let workflowDef = instance.workflowDefinition;

		if (!workflowDef) {
			const workflowDefOrErr = await this.workflowsService.getWorkflow(
				authCtx,
				instance.workflowDefinitionUuid,
			);
			if (workflowDefOrErr.isLeft()) {
				return left(workflowDefOrErr.value);
			}

			workflowDef = {
				uuid: workflowDefOrErr.value.uuid,
				title: workflowDefOrErr.value.title,
				description: workflowDefOrErr.value.description || "",
				createdTime: workflowDefOrErr.value.createdTime,
				modifiedTime: workflowDefOrErr.value.modifiedTime,
				states: workflowDefOrErr.value.states,
				availableStateNames: workflowDefOrErr.value.availableStateNames,
				groupsAllowed: workflowDefOrErr.value.groupsAllowed,
			};

			// Create updated instance with backfilled data
			instance = {
				...instance,
				workflowDefinition: workflowDef,
				groupsAllowed: instance.groupsAllowed.length > 0
					? instance.groupsAllowed
					: workflowDefOrErr.value.groupsAllowed,
			};
		}

		// Get the node
		const nodeOrErr = await this.nodeService.get(authCtx, nodeUuid);
		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}
		const node = nodeOrErr.value;

		// Find current state
		const currentState = workflowDef.states.find((s) => s.name === instance.currentStateName);
		if (!currentState) {
			return left(
				new BadRequestError(
					`Current state ${instance.currentStateName} not found in workflow definition`,
				),
			);
		}

		// Find transition
		const transition = currentState.transitions?.find((t) => t.signal === signal);
		if (!transition) {
			return left(
				new BadRequestError(
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
				new BadRequestError(
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
			timestamp: new Date().toISOString(),
			user: authCtx.principal.email,
			message,
		};

		// Create updated instance (immutable update)
		const updatedInstance: WorkflowInstanceData = {
			...instance,
			currentStateName: transition.targetState,
			history: [...(instance.history || []), historyEntry],
			running: !targetState.isFinal,
			modifiedTime: new Date().toISOString(),
		};

		// Save updated instance
		const updateOrErr = await this.configRepo.save("workflowInstances", updatedInstance);
		if (updateOrErr.isLeft()) {
			return left(updateOrErr.value);
		}

		// Check if we reached a final state
		if (!updatedInstance.running) {
			// Unlock the node
			await this.nodeService.unlock(authCtx, nodeUuid);
			await this.nodeService.update(authCtx, nodeUuid, {
				workflowState: null as unknown as string,
				workflowInstanceUuid: null as unknown as string,
			});
		} else {
			await this.nodeService.update(authCtx, nodeUuid, {
				workflowState: updatedInstance.currentStateName,
			});
		}

		return right(updatedInstance);
	}

	async cancelWorkflow(
		authCtx: AuthenticationContext,
		nodeUuid: string,
	): Promise<Either<AntboxError, WorkflowInstanceData>> {
		// Get workflow instance
		const instanceOrErr = await this.getWorkflowInstanceByNodeUuid(authCtx, nodeUuid);
		if (instanceOrErr.isLeft()) {
			return left(instanceOrErr.value);
		}
		const instance = instanceOrErr.value;

		// Check if user is allowed to cancel this instance
		// Only the owner or admins can cancel
		const isAdmin = authCtx.principal.groups.includes(ADMINS_GROUP_UUID);
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

		// Create updated instance with cancelled status (immutable update)
		const updatedInstance: WorkflowInstanceData = {
			...instance,
			cancelled: true,
			running: false,
			modifiedTime: new Date().toISOString(),
		};

		// Save updated instance
		const updateOrErr = await this.configRepo.save("workflowInstances", updatedInstance);
		if (updateOrErr.isLeft()) {
			return left(updateOrErr.value);
		}

		// Unlock the node
		await this.nodeService.unlock(authCtx, nodeUuid);
		await this.nodeService.update(authCtx, nodeUuid, {
			workflowState: null as unknown as string,
			workflowInstanceUuid: null as unknown as string,
		});

		return right(updatedInstance);
	}

	async findActiveInstances(
		authCtx: AuthenticationContext,
		workflowDefinitionUuid?: string,
	): Promise<Either<AntboxError, WorkflowInstanceData[]>> {
		const instancesOrErr = await this.listWorkflowInstances(authCtx);

		if (instancesOrErr.isLeft()) {
			return left(instancesOrErr.value);
		}

		let instances = instancesOrErr.value;

		if (workflowDefinitionUuid) {
			instances = instances.filter((i) => i.workflowDefinitionUuid === workflowDefinitionUuid);
		}

		// Filter to only running instances
		instances = instances.filter((i) => i.running);

		return right(instances);
	}

	async updateNode(
		authCtx: AuthenticationContext,
		nodeUuid: string,
		metadata: Partial<NodeMetadata>,
	): Promise<Either<AntboxError, void>> {
		// Get workflow instance
		const instanceOrErr = await this.getWorkflowInstanceByNodeUuid(authCtx, nodeUuid);
		if (instanceOrErr.isLeft()) {
			return left(instanceOrErr.value);
		}
		const instance = instanceOrErr.value;

		// Check if user is allowed to access this instance
		if (!this.#hasPermission(authCtx, instance.groupsAllowed)) {
			return left(new ForbiddenError());
		}

		// Check if instance is cancelled or not running
		if (instance.cancelled || !instance.running) {
			return left(
				new BadRequestError("Cannot update node in a cancelled or completed workflow"),
			);
		}

		// Get workflow definition to check current state permissions
		let workflowDef = instance.workflowDefinition;
		if (!workflowDef) {
			const workflowDefOrErr = await this.workflowsService.getWorkflow(
				authCtx,
				instance.workflowDefinitionUuid,
			);
			if (workflowDefOrErr.isLeft()) {
				return left(workflowDefOrErr.value);
			}
			workflowDef = {
				uuid: workflowDefOrErr.value.uuid,
				title: workflowDefOrErr.value.title,
				description: workflowDefOrErr.value.description || "",
				createdTime: workflowDefOrErr.value.createdTime,
				modifiedTime: workflowDefOrErr.value.modifiedTime,
				states: workflowDefOrErr.value.states,
				availableStateNames: workflowDefOrErr.value.availableStateNames,
				groupsAllowed: workflowDefOrErr.value.groupsAllowed,
			};
		}

		// Find current state
		const currentState = workflowDef.states.find((s) => s.name === instance.currentStateName);
		if (!currentState) {
			return left(
				new BadRequestError(
					`Current state ${instance.currentStateName} not found in workflow definition`,
				),
			);
		}

		// Check if user is in allowed groups for modification
		if (!this.#canUserModifyInState(authCtx, currentState, instance.groupsAllowed)) {
			return left(new ForbiddenError());
		}

		// Create workflow-instance context
		const workflowInstanceCtx: AuthenticationContext = {
			tenant: authCtx.tenant,
			principal: {
				email: Users.WORKFLOW_INSTANCE_USER_EMAIL,
				groups: [Groups.ADMINS_GROUP_UUID],
			},
			mode: authCtx.mode,
		};

		// Call node service with workflow-instance credentials
		return await this.nodeService.update(
			workflowInstanceCtx,
			nodeUuid,
			metadata,
		);
	}

	async updateNodeFile(
		authCtx: AuthenticationContext,
		nodeUuid: string,
		file: File,
	): Promise<Either<AntboxError, void>> {
		// Get workflow instance
		const instanceOrErr = await this.getWorkflowInstanceByNodeUuid(authCtx, nodeUuid);
		if (instanceOrErr.isLeft()) {
			return left(instanceOrErr.value);
		}
		const instance = instanceOrErr.value;

		// Check if user is allowed to access this instance
		if (!this.#hasPermission(authCtx, instance.groupsAllowed)) {
			return left(new ForbiddenError());
		}

		// Check if instance is cancelled or not running
		if (instance.cancelled || !instance.running) {
			return left(
				new BadRequestError("Cannot update node file in a cancelled or completed workflow"),
			);
		}

		// Get workflow definition to check current state permissions
		let workflowDef = instance.workflowDefinition;
		if (!workflowDef) {
			const workflowDefOrErr = await this.workflowsService.getWorkflow(
				authCtx,
				instance.workflowDefinitionUuid,
			);
			if (workflowDefOrErr.isLeft()) {
				return left(workflowDefOrErr.value);
			}
			workflowDef = {
				uuid: workflowDefOrErr.value.uuid,
				title: workflowDefOrErr.value.title,
				description: workflowDefOrErr.value.description || "",
				createdTime: workflowDefOrErr.value.createdTime,
				modifiedTime: workflowDefOrErr.value.modifiedTime,
				states: workflowDefOrErr.value.states,
				availableStateNames: workflowDefOrErr.value.availableStateNames,
				groupsAllowed: workflowDefOrErr.value.groupsAllowed,
			};
		}

		// Find current state
		const currentState = workflowDef.states.find((s) => s.name === instance.currentStateName);
		if (!currentState) {
			return left(
				new BadRequestError(
					`Current state ${instance.currentStateName} not found in workflow definition`,
				),
			);
		}

		// Check if user is in allowed groups for modification
		if (!this.#canUserModifyInState(authCtx, currentState, instance.groupsAllowed)) {
			return left(new ForbiddenError());
		}

		// Create workflow-instance context
		const workflowInstanceCtx: AuthenticationContext = {
			tenant: authCtx.tenant,
			principal: {
				email: Users.WORKFLOW_INSTANCE_USER_EMAIL,
				groups: [Groups.ADMINS_GROUP_UUID],
			},
			mode: authCtx.mode,
		};

		// Call node service with workflow-instance credentials
		return await this.nodeService.updateFile(
			workflowInstanceCtx,
			nodeUuid,
			file,
		);
	}

	// ============================================================================
	// BASIC CRUD METHODS
	// ============================================================================

	async getWorkflowInstance(
		ctx: AuthenticationContext,
		uuid: string,
	): Promise<Either<AntboxError, WorkflowInstanceData>> {
		// Check builtin instances first (currently none)
		const builtinInstance = BUILTIN_WORKFLOW_INSTANCES.find((i) => i.uuid === uuid);
		if (builtinInstance) {
			if (!this.#hasPermission(ctx, builtinInstance.groupsAllowed)) {
				return left(new ForbiddenError("Not authorized to view this workflow instance"));
			}
			return right(builtinInstance);
		}

		const instanceOrErr = await this.configRepo.get("workflowInstances", uuid);
		if (instanceOrErr.isLeft()) {
			return instanceOrErr;
		}

		// Check permission
		if (!this.#hasPermission(ctx, instanceOrErr.value.groupsAllowed)) {
			return left(new ForbiddenError("Not authorized to view this workflow instance"));
		}

		// Best-effort backfill for instances created before snapshots existed
		let instance = instanceOrErr.value;
		if (!instance.workflowDefinition) {
			const workflowDefOrErr = await this.workflowsService.getWorkflow(
				ctx,
				instance.workflowDefinitionUuid,
			);
			if (workflowDefOrErr.isRight()) {
				const backfilledInstance: WorkflowInstanceData = {
					...instance,
					workflowDefinition: {
						uuid: workflowDefOrErr.value.uuid,
						title: workflowDefOrErr.value.title,
						description: workflowDefOrErr.value.description || "",
						createdTime: workflowDefOrErr.value.createdTime,
						modifiedTime: workflowDefOrErr.value.modifiedTime,
						states: workflowDefOrErr.value.states,
						availableStateNames: workflowDefOrErr.value.availableStateNames,
						groupsAllowed: workflowDefOrErr.value.groupsAllowed,
					},
					groupsAllowed: (instance.groupsAllowed && instance.groupsAllowed.length > 0)
						? instance.groupsAllowed
						: workflowDefOrErr.value.groupsAllowed,
				};

				// Ignore backfill failures; the instance is still returned
				await this.configRepo.save("workflowInstances", backfilledInstance);
				instance = backfilledInstance;
			}
		}

		return right(instance);
	}

	async getWorkflowInstanceByNodeUuid(
		ctx: AuthenticationContext,
		nodeUuid: string,
	): Promise<Either<AntboxError, WorkflowInstanceData>> {
		// List all instances and find by nodeUuid
		const instancesOrErr = await this.configRepo.list("workflowInstances");
		if (instancesOrErr.isLeft()) {
			return left(instancesOrErr.value);
		}

		const instance = instancesOrErr.value.find((i) => i.nodeUuid === nodeUuid);
		if (!instance) {
			return left(new BadRequestError(`No workflow instance found for node ${nodeUuid}`));
		}

		// Check permission
		if (!this.#hasPermission(ctx, instance.groupsAllowed)) {
			return left(new ForbiddenError("Not authorized to view this workflow instance"));
		}

		return right(instance);
	}

	async listWorkflowInstances(
		ctx: AuthenticationContext,
	): Promise<Either<AntboxError, WorkflowInstanceData[]>> {
		const customInstancesOrErr = await this.configRepo.list("workflowInstances");

		if (customInstancesOrErr.isLeft()) {
			return customInstancesOrErr;
		}

		// Combine builtin instances with custom instances
		const allInstances = [...BUILTIN_WORKFLOW_INSTANCES, ...customInstancesOrErr.value];

		// Filter by permission - only return instances user can access
		const accessibleInstances = allInstances.filter((i) =>
			this.#hasPermission(ctx, i.groupsAllowed)
		);

		// Sort by startedTime (newest first)
		accessibleInstances.sort((a, b) =>
			new Date(b.startedTime).getTime() - new Date(a.startedTime).getTime()
		);

		return right(accessibleInstances);
	}

	async deleteWorkflowInstance(
		ctx: AuthenticationContext,
		uuid: string,
	): Promise<Either<AntboxError, void>> {
		// Check admin permission
		if (!this.#isAdmin(ctx)) {
			return left(new ForbiddenError("Only admins can delete workflow instances"));
		}

		// Cannot delete builtin instances (currently none, but future-proof)
		if (BUILTIN_WORKFLOW_INSTANCES.some((i) => i.uuid === uuid)) {
			return left(new BadRequestError("Cannot delete builtin workflow instances"));
		}

		return this.configRepo.delete("workflowInstances", uuid);
	}

	// ============================================================================
	// PRIVATE HELPER METHODS
	// ============================================================================

	#isAdmin(ctx: AuthenticationContext): boolean {
		return ctx.principal.groups.includes(ADMINS_GROUP_UUID);
	}

	#hasPermission(ctx: AuthenticationContext, groupsAllowed: string[]): boolean {
		// Admins have access to everything
		if (this.#isAdmin(ctx)) {
			return true;
		}

		// If groupsAllowed is empty, everyone has access
		if (!groupsAllowed || groupsAllowed.length === 0) {
			return true;
		}

		// Check if user is in any of the allowed groups
		return ctx.principal.groups.some((g) => groupsAllowed.includes(g));
	}

	#canUserModifyInState(
		authCtx: AuthenticationContext,
		state: { groupsAllowedToModify?: string[] },
		workflowGroupsAllowed?: string[],
	): boolean {
		// Admins can always modify
		if (this.#isAdmin(authCtx)) {
			return true;
		}

		// Use state's groupsAllowedToModify if specified, otherwise use workflow's groupsAllowed
		const allowedGroups = state.groupsAllowedToModify || workflowGroupsAllowed || [];

		// If no groups specified, all users can modify
		if (allowedGroups.length === 0) {
			return true;
		}

		// Check if user belongs to any of the allowed groups
		return allowedGroups.some((allowedGroup) => authCtx.principal.groups.includes(allowedGroup));
	}

	/**
	 * Parse action string in the format: "[action_uuid] [param]=[value]"
	 * Example: "rename new_name='New Name'"
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
	 */
	async #executeActions(
		actions: string[],
		authCtx: AuthenticationContext,
		nodeUuid: string,
	): Promise<Either<AntboxError, void>> {
		for (const actionString of actions) {
			const { actionUuid, params } = this.#parseAction(actionString);

			// Execute the action using FeaturesService
			const result = await this.featuresService.runAction(
				authCtx,
				actionUuid,
				[nodeUuid],
				params,
			);

			if (result.isLeft()) {
				return left(
					new BadRequestError(
						`Failed to execute action "${actionString}": ${result.value.message}`,
					),
				);
			}
		}

		return right(undefined);
	}
}
