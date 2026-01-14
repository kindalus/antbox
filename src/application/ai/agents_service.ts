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
import type { AgentSkillData, AgentSkillMetadata } from "domain/configuration/skill_data.ts";
import { extractSkillMetadata } from "domain/configuration/skill_data.ts";
import { AgentSkillDataSchema } from "domain/configuration/skill_schema.ts";
import {
	extractLevel2Content,
	extractLevel3Resource,
	listLevel3Resources,
	parseSkillMarkdown,
	toAgentSkillData,
	toSkillMarkdown,
} from "./skill_parser.ts";

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
	// SKILL OPERATIONS
	// ========================================================================

	/**
	 * Creates or replaces a skill from markdown content.
	 * If a skill with the same name (uuid) exists, it will be replaced.
	 * The uuid is derived from the skill name in the frontmatter.
	 */
	async createOrReplaceSkill(
		ctx: AuthenticationContext,
		markdown: string,
	): Promise<Either<AntboxError, AgentSkillData>> {
		if (!this.#isAdmin(ctx)) {
			return left(new ForbiddenError("Only admins can create skills"));
		}

		// Parse the markdown
		const parsedOrErr = parseSkillMarkdown(markdown);
		if (parsedOrErr.isLeft()) {
			return parsedOrErr;
		}

		const parsed = parsedOrErr.value;
		const now = new Date().toISOString();

		// Check if skill with same name (uuid) exists to preserve createdTime
		const existingOrErr = await this.getSkill(ctx, parsed.frontmatter.name);
		const existingCreatedTime = existingOrErr.isRight()
			? existingOrErr.value.createdTime
			: undefined;

		const skillData = toAgentSkillData(parsed, now, existingCreatedTime);

		// Validate with Zod schema
		const validation = AgentSkillDataSchema.safeParse(skillData);
		if (!validation.success) {
			const errors = validation.error.issues.map((e) =>
				new BadRequestError(`${e.path.join(".")}: ${e.message}`)
			);
			return left(ValidationError.from(...errors));
		}

		return this.#configRepo.save("skills", skillData);
	}

	/**
	 * Gets a skill by UUID (which is the same as the skill name in kebab-case).
	 */
	async getSkill(
		_ctx: AuthenticationContext,
		uuid: string,
	): Promise<Either<AntboxError, AgentSkillData>> {
		return this.#configRepo.get("skills", uuid);
	}

	/**
	 * Lists all skills.
	 */
	async listSkills(
		_ctx: AuthenticationContext,
	): Promise<Either<AntboxError, AgentSkillData[]>> {
		const skillsOrErr = await this.#configRepo.list("skills");
		if (skillsOrErr.isLeft()) {
			return skillsOrErr;
		}

		// Sort by uuid (which is the name)
		skillsOrErr.value.sort((a, b) => a.uuid.localeCompare(b.uuid));
		return skillsOrErr;
	}

	/**
	 * Lists skill metadata (Level 1) for all skills.
	 * This is used at agent startup to populate the system prompt.
	 * Access control is handled at the agent level, not the skill level.
	 */
	async listSkillMetadata(
		_ctx: AuthenticationContext,
	): Promise<Either<AntboxError, AgentSkillMetadata[]>> {
		const skillsOrErr = await this.#configRepo.list("skills");
		if (skillsOrErr.isLeft()) {
			return skillsOrErr;
		}

		// Extract metadata only
		const metadata = skillsOrErr.value.map(extractSkillMetadata);
		metadata.sort((a, b) => a.uuid.localeCompare(b.uuid));

		return right(metadata);
	}

	/**
	 * Loads a skill's content (Level 2 + optional Level 3 resources).
	 * This implements the loadSkill(skillName, ...resources) function from the spec.
	 */
	async loadSkill(
		ctx: AuthenticationContext,
		skillName: string,
		...resources: string[]
	): Promise<Either<AntboxError, string>> {
		const skillOrErr = await this.getSkill(ctx, skillName);
		if (skillOrErr.isLeft()) {
			return skillOrErr;
		}

		const skill = skillOrErr.value;

		// Start with Level 2 content
		let result = extractLevel2Content(skill.content);

		// Add requested Level 3 resources
		for (const resourceSlug of resources) {
			const resourceContent = extractLevel3Resource(skill.content, resourceSlug);
			if (resourceContent) {
				result += "\n\n" + resourceContent;
			}
		}

		return right(result);
	}

	/**
	 * Lists available Level 3 resources for a skill.
	 */
	async listSkillResources(
		ctx: AuthenticationContext,
		skillName: string,
	): Promise<Either<AntboxError, string[]>> {
		const skillOrErr = await this.getSkill(ctx, skillName);
		if (skillOrErr.isLeft()) {
			return skillOrErr;
		}

		return right(listLevel3Resources(skillOrErr.value.content));
	}

	/**
	 * Exports a skill as markdown.
	 */
	async exportSkill(
		ctx: AuthenticationContext,
		uuid: string,
	): Promise<Either<AntboxError, string>> {
		const skillOrErr = await this.getSkill(ctx, uuid);
		if (skillOrErr.isLeft()) {
			return skillOrErr;
		}

		return right(toSkillMarkdown(skillOrErr.value));
	}

	/**
	 * Deletes a skill by UUID.
	 */
	async deleteSkill(
		ctx: AuthenticationContext,
		uuid: string,
	): Promise<Either<AntboxError, void>> {
		if (!this.#isAdmin(ctx)) {
			return left(new ForbiddenError("Only admins can delete skills"));
		}

		return this.#configRepo.delete("skills", uuid);
	}

	// ========================================================================
	// HELPER METHODS
	// ========================================================================

	#isAdmin(ctx: AuthenticationContext): boolean {
		return ctx.principal.groups.includes(ADMINS_GROUP_UUID);
	}
}
