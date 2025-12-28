import type { AntboxError } from "shared/antbox_error.ts";
import { BadRequestError, ForbiddenError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import { ValidationError } from "shared/validation_error.ts";
import type { AuthenticationContext } from "../security/authentication_context.ts";
import type { ConfigurationRepository } from "domain/configuration/configuration_repository.ts";
import type { AspectData } from "domain/configuration/aspect_data.ts";
import { AspectDataSchema } from "domain/configuration/aspect_schema.ts";
import { ADMINS_GROUP_UUID } from "domain/configuration/builtin_groups.ts";
import { BUILTIN_ASPECTS } from "domain/configuration/builtin_aspects.ts";
import { UuidGenerator } from "shared/uuid_generator.ts";

/**
 * AspectsService - Manages aspects in the configuration repository
 * Aspects define metadata schemas for nodes
 *
 * Note: Aspects can be updated (filters and properties can change)
 */
export class AspectsService {
	constructor(private readonly configRepo: ConfigurationRepository) {}

	async createAspect(
		ctx: AuthenticationContext,
		data: Omit<AspectData, "uuid" | "createdTime" | "modifiedTime">,
	): Promise<Either<AntboxError, AspectData>> {
		// Check admin permission
		if (!this.#isAdmin(ctx)) {
			return left(new ForbiddenError("Only admins can create aspects"));
		}

		const now = new Date().toISOString();
		const aspectData: AspectData = {
			uuid: UuidGenerator.generate(),
			title: data.title,
			description: data.description,
			filters: data.filters || [],
			properties: data.properties || [],
			createdTime: now,
			modifiedTime: now,
		};

		// Validate with Zod schema
		const validation = AspectDataSchema.safeParse(aspectData);
		if (!validation.success) {
			const errors = validation.error.issues.map((e) =>
				new BadRequestError(`${e.path.join(".")}: ${e.message}`)
			);
			return left(ValidationError.from(...errors));
		}

		return this.configRepo.save("aspects", aspectData);
	}

	async getAspect(
		_ctx: AuthenticationContext,
		uuid: string,
	): Promise<Either<AntboxError, AspectData>> {
		// Check builtin aspects first (currently none)
		const builtinAspect = BUILTIN_ASPECTS.find((a) => a.uuid === uuid);
		if (builtinAspect) {
			return right(builtinAspect);
		}

		return this.configRepo.get("aspects", uuid);
	}

	async listAspects(
		_ctx: AuthenticationContext,
	): Promise<Either<AntboxError, AspectData[]>> {
		const customAspectsOrErr = await this.configRepo.list("aspects");

		if (customAspectsOrErr.isLeft()) {
			return customAspectsOrErr;
		}

		// Combine builtin aspects with custom aspects, sorted by title
		const allAspects = [...BUILTIN_ASPECTS, ...customAspectsOrErr.value];
		allAspects.sort((a, b) => a.title.localeCompare(b.title));

		return right(allAspects);
	}

	async updateAspect(
		ctx: AuthenticationContext,
		uuid: string,
		updates: Partial<Omit<AspectData, "uuid" | "createdTime">>,
	): Promise<Either<AntboxError, AspectData>> {
		// Check admin permission
		if (!this.#isAdmin(ctx)) {
			return left(new ForbiddenError("Only admins can update aspects"));
		}

		// Cannot update builtin aspects (currently none, but future-proof)
		if (BUILTIN_ASPECTS.some((a) => a.uuid === uuid)) {
			return left(new BadRequestError("Cannot update builtin aspects"));
		}

		const existingOrErr = await this.configRepo.get("aspects", uuid);
		if (existingOrErr.isLeft()) {
			return existingOrErr;
		}

		const updatedData: AspectData = {
			...existingOrErr.value,
			...updates,
			uuid, // Ensure UUID doesn't change
			modifiedTime: new Date().toISOString(),
		};

		// Validate with Zod schema
		const validation = AspectDataSchema.safeParse(updatedData);
		if (!validation.success) {
			const errors = validation.error.issues.map((e) =>
				new BadRequestError(`${e.path.join(".")}: ${e.message}`)
			);
			return left(ValidationError.from(...errors));
		}

		return this.configRepo.save("aspects", updatedData);
	}

	async deleteAspect(
		ctx: AuthenticationContext,
		uuid: string,
	): Promise<Either<AntboxError, void>> {
		// Check admin permission
		if (!this.#isAdmin(ctx)) {
			return left(new ForbiddenError("Only admins can delete aspects"));
		}

		// Cannot delete builtin aspects (currently none, but future-proof)
		if (BUILTIN_ASPECTS.some((a) => a.uuid === uuid)) {
			return left(new BadRequestError("Cannot delete builtin aspects"));
		}

		return this.configRepo.delete("aspects", uuid);
	}

	async exportAspect(
		ctx: AuthenticationContext,
		uuid: string,
	): Promise<Either<AntboxError, File>> {
		const aspectOrErr = await this.getAspect(ctx, uuid);
		if (aspectOrErr.isLeft()) {
			return left(aspectOrErr.value);
		}

		const file = new File(
			[JSON.stringify(aspectOrErr.value, null, 2)],
			`${aspectOrErr.value.uuid}.json`,
			{
				type: "application/json",
			},
		);

		return right(file);
	}

	#isAdmin(ctx: AuthenticationContext): boolean {
		return ctx.principal.groups.includes(ADMINS_GROUP_UUID);
	}
}
