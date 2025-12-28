import type { AntboxError } from "shared/antbox_error.ts";
import { BadRequestError, ForbiddenError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import { ValidationError } from "shared/validation_error.ts";
import type { AuthenticationContext } from "../security/authentication_context.ts";
import type { ConfigurationRepository } from "domain/configuration/configuration_repository.ts";
import type { AgentData } from "domain/configuration/agent_data.ts";
import { AgentDataSchema } from "domain/configuration/agent_schema.ts";
import { ADMINS_GROUP_UUID } from "domain/configuration/builtin_groups.ts";
import { BUILTIN_AGENTS } from "domain/configuration/builtin_agents.ts";
import { UuidGenerator } from "shared/uuid_generator.ts";
import type { AIModel } from "./ai_model.ts";
import { AIModelDTO, aiModelToDto } from "./ai_model_dto.ts";

/**
 * Context for AgentsService dependencies
 */
export interface AgentsServiceContext {
	readonly configRepo: ConfigurationRepository;
	readonly models: AIModel[];
}

/**
 * AgentsService - Manages AI agent configurations (CRUD operations only)
 *
 * Agents are mutable configurations that define AI assistant behavior.
 *
 * For agent execution (chat, answer), use AgentsEngine.
 *
 * Access control:
 * - Create/Delete: Admin-only
 * - Update: Admin-only (agents can be modified)
 * - Read: Public (all users can view agents)
 */
export class AgentsService {
	readonly #configRepo: ConfigurationRepository;
	readonly #models: AIModel[];

	constructor(ctx: AgentsServiceContext) {
		this.#configRepo = ctx.configRepo;
		this.#models = ctx.models;
	}

	// ========================================================================
	// CRUD OPERATIONS
	// ========================================================================

	async createAgent(
		ctx: AuthenticationContext,
		data: Omit<AgentData, "uuid" | "createdTime" | "modifiedTime">,
	): Promise<Either<AntboxError, AgentData>> {
		// Check admin permission
		if (!this.#isAdmin(ctx)) {
			return left(new ForbiddenError("Only admins can create agents"));
		}

		const now = new Date().toISOString();
		const agentData: AgentData = {
			uuid: UuidGenerator.generate(),
			...data,
			createdTime: now,
			modifiedTime: now,
		};

		// Validate with Zod schema
		const validation = AgentDataSchema.safeParse(agentData);
		if (!validation.success) {
			const errors = validation.error.issues.map((e) =>
				new BadRequestError(`${e.path.join(".")}: ${e.message}`)
			);
			return left(ValidationError.from(...errors));
		}

		return this.#configRepo.save("agents", agentData);
	}

	async getAgent(
		_ctx: AuthenticationContext,
		uuid: string,
	): Promise<Either<AntboxError, AgentData>> {
		// Check builtin agents first
		const builtinAgent = BUILTIN_AGENTS.find((a) => a.uuid === uuid);
		if (builtinAgent) {
			return right(builtinAgent);
		}

		return this.#configRepo.get("agents", uuid);
	}

	async listAgents(
		_ctx: AuthenticationContext,
	): Promise<Either<AntboxError, AgentData[]>> {
		const customAgentsOrErr = await this.#configRepo.list("agents");

		if (customAgentsOrErr.isLeft()) {
			return customAgentsOrErr;
		}

		// Combine builtin agents with custom agents
		const allAgents = [...BUILTIN_AGENTS, ...customAgentsOrErr.value];

		// Sort by title
		allAgents.sort((a, b) => a.title.localeCompare(b.title));

		return right(allAgents);
	}

	async updateAgent(
		ctx: AuthenticationContext,
		uuid: string,
		updates: Partial<Omit<AgentData, "uuid" | "createdTime">>,
	): Promise<Either<AntboxError, AgentData>> {
		// Check admin permission
		if (!this.#isAdmin(ctx)) {
			return left(new ForbiddenError("Only admins can update agents"));
		}

		// Cannot update builtin agents
		if (BUILTIN_AGENTS.some((a) => a.uuid === uuid)) {
			return left(new BadRequestError("Cannot update builtin agents"));
		}

		const existingOrErr = await this.#configRepo.get("agents", uuid);
		if (existingOrErr.isLeft()) {
			return existingOrErr;
		}

		const updatedData: AgentData = {
			...existingOrErr.value,
			...updates,
			uuid, // Ensure UUID doesn't change
			createdTime: existingOrErr.value.createdTime, // Preserve creation time
			modifiedTime: new Date().toISOString(),
		};

		// Validate with Zod schema
		const validation = AgentDataSchema.safeParse(updatedData);
		if (!validation.success) {
			const errors = validation.error.issues.map((e) =>
				new BadRequestError(`${e.path.join(".")}: ${e.message}`)
			);
			return left(ValidationError.from(...errors));
		}

		return this.#configRepo.save("agents", updatedData);
	}

	async deleteAgent(
		ctx: AuthenticationContext,
		uuid: string,
	): Promise<Either<AntboxError, void>> {
		// Check admin permission
		if (!this.#isAdmin(ctx)) {
			return left(new ForbiddenError("Only admins can delete agents"));
		}

		// Cannot delete builtin agents
		if (BUILTIN_AGENTS.some((a) => a.uuid === uuid)) {
			return left(new BadRequestError("Cannot delete builtin agents"));
		}

		return this.#configRepo.delete("agents", uuid);
	}

	// ========================================================================
	// MODEL LISTING
	// ========================================================================

	listModels(authContext: AuthenticationContext): Either<AntboxError, AIModelDTO[]> {
		if (!authContext.principal.groups.includes(ADMINS_GROUP_UUID)) {
			return left(new ForbiddenError());
		}

		return right(this.#models.map(aiModelToDto));
	}

	// ========================================================================
	// HELPER METHODS
	// ========================================================================

	#isAdmin(ctx: AuthenticationContext): boolean {
		return ctx.principal.groups.includes(ADMINS_GROUP_UUID);
	}
}
