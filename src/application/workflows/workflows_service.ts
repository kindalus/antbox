import type { AntboxError } from "shared/antbox_error.ts";
import { BadRequestError, ForbiddenError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import { ValidationError } from "shared/validation_error.ts";
import type { AuthenticationContext } from "../security/authentication_context.ts";
import type { ConfigurationRepository } from "domain/configuration/configuration_repository.ts";
import type { WorkflowData } from "domain/configuration/workflow_data.ts";
import { WorkflowDataSchema } from "domain/configuration/workflow_schema.ts";
import { ADMINS_GROUP_UUID } from "domain/configuration/builtin_groups.ts";
import { BUILTIN_WORKFLOWS } from "domain/configuration/builtin_workflows.ts";
import { UuidGenerator } from "shared/uuid_generator.ts";

/**
 * WorkflowsService - Manages workflow definitions in the configuration repository
 * Workflows define the states and transitions for business processes
 */
export class WorkflowsService {
	constructor(private readonly configRepo: ConfigurationRepository) {}

	async createWorkflow(
		ctx: AuthenticationContext,
		data: Partial<WorkflowData>,
	): Promise<Either<AntboxError, WorkflowData>> {
		// Check admin permission
		if (!this.#isAdmin(ctx)) {
			return left(new ForbiddenError("Only admins can create workflows"));
		}

		const now = new Date().toISOString();
		const workflowData: WorkflowData = {
			uuid: data.uuid || UuidGenerator.generate(),
			title: data.title || "",
			description: data.description || "",
			states: data.states || [],
			availableStateNames: data.availableStateNames || [],
			filters: data.filters || [],
			groupsAllowed: data.groupsAllowed || [],
			createdTime: now,
			modifiedTime: now,
		};

		// Validate with Zod schema
		const validation = WorkflowDataSchema.safeParse(workflowData);
		if (!validation.success) {
			const errors = validation.error.issues.map((e) =>
				new BadRequestError(`${e.path.join(".")}: ${e.message}`)
			);
			return left(ValidationError.from(...errors));
		}

		return this.configRepo.save("workflows", workflowData);
	}

	async createOrReplaceWorkflow(
		ctx: AuthenticationContext,
		data: Partial<WorkflowData>,
	): Promise<Either<AntboxError, WorkflowData>> {
		// Check admin permission
		if (!this.#isAdmin(ctx)) {
			return left(new ForbiddenError("Only admins can create or update workflows"));
		}

		// Check if it's a builtin workflow
		if (data.uuid) {
			const isBuiltin = BUILTIN_WORKFLOWS.some((w) => w.uuid === data.uuid);
			if (isBuiltin) {
				return left(new BadRequestError("Cannot update built-in workflow"));
			}

			// Try to get existing workflow definition
			const existingOrErr = await this.configRepo.get("workflows", data.uuid);

			if (existingOrErr.isRight()) {
				// Update existing workflow
				return this.updateWorkflow(ctx, data.uuid, data);
			}
		}

		// Create new workflow
		return this.createWorkflow(ctx, data);
	}

	async getWorkflow(
		_ctx: AuthenticationContext,
		uuid: string,
	): Promise<Either<AntboxError, WorkflowData>> {
		// Check builtin workflows first
		const builtinWorkflow = BUILTIN_WORKFLOWS.find((w) => w.uuid === uuid);
		if (builtinWorkflow) {
			return right(builtinWorkflow);
		}

		return this.configRepo.get("workflows", uuid);
	}

	async listWorkflows(
		_ctx: AuthenticationContext,
	): Promise<Either<AntboxError, WorkflowData[]>> {
		const customWorkflowsOrErr = await this.configRepo.list("workflows");

		if (customWorkflowsOrErr.isLeft()) {
			return customWorkflowsOrErr;
		}

		// Combine builtin workflows with custom workflows, sorted by title
		const allWorkflows = [...BUILTIN_WORKFLOWS, ...customWorkflowsOrErr.value];
		allWorkflows.sort((a, b) => a.title.localeCompare(b.title));

		return right(allWorkflows);
	}

	async updateWorkflow(
		ctx: AuthenticationContext,
		uuid: string,
		updates: Partial<Omit<WorkflowData, "uuid" | "createdTime">>,
	): Promise<Either<AntboxError, WorkflowData>> {
		// Check admin permission
		if (!this.#isAdmin(ctx)) {
			return left(new ForbiddenError("Only admins can update workflows"));
		}

		// Cannot update builtin workflows
		if (BUILTIN_WORKFLOWS.some((w) => w.uuid === uuid)) {
			return left(new BadRequestError("Cannot update builtin workflows"));
		}

		const existingOrErr = await this.configRepo.get("workflows", uuid);
		if (existingOrErr.isLeft()) {
			return existingOrErr;
		}

		const updatedData: WorkflowData = {
			...existingOrErr.value,
			...updates,
			uuid, // Ensure UUID doesn't change
			modifiedTime: new Date().toISOString(),
		};

		// Validate with Zod schema
		const validation = WorkflowDataSchema.safeParse(updatedData);
		if (!validation.success) {
			const errors = validation.error.issues.map((e) =>
				new BadRequestError(`${e.path.join(".")}: ${e.message}`)
			);
			return left(ValidationError.from(...errors));
		}

		return this.configRepo.save("workflows", updatedData);
	}

	async deleteWorkflow(
		ctx: AuthenticationContext,
		uuid: string,
	): Promise<Either<AntboxError, void>> {
		// Check admin permission
		if (!this.#isAdmin(ctx)) {
			return left(new ForbiddenError("Only admins can delete workflows"));
		}

		// Cannot delete builtin workflows
		if (BUILTIN_WORKFLOWS.some((w) => w.uuid === uuid)) {
			return left(new BadRequestError("Cannot delete builtin workflows"));
		}

		// Check if there are any active instances using this workflow
		const instancesOrErr = await this.configRepo.list("workflowInstances");

		if (instancesOrErr.isRight()) {
			const activeInstances = instancesOrErr.value.filter(
				(i) => i.workflowDefinitionUuid === uuid && i.running,
			);

			if (activeInstances.length > 0) {
				return left(
					new BadRequestError(
						`Cannot delete workflow definition: ${activeInstances.length} active instance(s) exist`,
					),
				);
			}
		}

		return this.configRepo.delete("workflows", uuid);
	}

	#isAdmin(ctx: AuthenticationContext): boolean {
		return ctx.principal.groups.includes(ADMINS_GROUP_UUID);
	}
}
