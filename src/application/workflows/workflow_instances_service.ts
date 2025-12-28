import type { AntboxError } from "shared/antbox_error.ts";
import { BadRequestError, ForbiddenError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import type { AuthenticationContext } from "../security/authentication_context.ts";
import type { ConfigurationRepository } from "domain/configuration/configuration_repository.ts";
import type { WorkflowInstanceData } from "domain/configuration/workflow_instance_data.ts";
import { ADMINS_GROUP_UUID } from "domain/configuration/builtin_groups.ts";
import { BUILTIN_WORKFLOW_INSTANCES } from "domain/configuration/builtin_workflow_instances.ts";
import type { WorkflowsService } from "./workflows_service.ts";

export interface WorkflowInstancesServiceContext {
	configRepo: ConfigurationRepository;
	workflowsService: WorkflowsService;
}

/**
 * WorkflowInstancesService - Manages workflow instance data (CRUD operations only)
 *
 * For workflow execution (start, transition, cancel), use WorkflowInstancesEngine.
 */
export class WorkflowInstancesService {
	readonly #configRepo: ConfigurationRepository;
	readonly #workflowsService: WorkflowsService;

	constructor(ctx: WorkflowInstancesServiceContext) {
		this.#configRepo = ctx.configRepo;
		this.#workflowsService = ctx.workflowsService;
	}

	// ============================================================================
	// CRUD METHODS
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

		const instanceOrErr = await this.#configRepo.get("workflowInstances", uuid);
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
			const workflowDefOrErr = await this.#workflowsService.getWorkflow(
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
				await this.#configRepo.save("workflowInstances", backfilledInstance);
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
		const instancesOrErr = await this.#configRepo.list("workflowInstances");
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
		const customInstancesOrErr = await this.#configRepo.list("workflowInstances");

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

		return this.#configRepo.delete("workflowInstances", uuid);
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
}
