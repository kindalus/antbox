import { BUILTIN_FEATURES } from "domain/configuration/builtin_features.ts";
import { ADMINS_GROUP_UUID } from "domain/configuration/builtin_groups.ts";
import type { ConfigurationRepository } from "domain/configuration/configuration_repository.ts";
import type { FeatureData } from "domain/configuration/feature_data.ts";
import { FeatureDataSchema } from "domain/configuration/feature_schema.ts";
import { Users } from "domain/users_groups/users.ts";
import { Groups } from "domain/users_groups/groups.ts";
import { AntboxError, BadRequestError, ForbiddenError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import { UuidGenerator } from "shared/uuid_generator.ts";
import { ValidationError } from "shared/validation_error.ts";
import type { AuthenticationContext } from "../security/authentication_context.ts";

export interface FeaturesServiceContext {
	configRepo: ConfigurationRepository;
}

/**
 * FeaturesService - Manages feature configurations (CRUD operations only)
 *
 * Features are mutable configurations that define custom functionality and actions.
 * Features include both metadata and executable code stored as a module string.
 *
 * For feature execution (actions, extensions, AI tools), use FeaturesEngine.
 *
 * Access control:
 * - Create/Delete: Admin-only
 * - Update: Admin-only (features can be modified)
 * - Read: Public (all users can view features)
 */
export class FeaturesService {
	readonly #configRepo: ConfigurationRepository;

	constructor(ctx: FeaturesServiceContext) {
		this.#configRepo = ctx.configRepo;
	}

	// ===== CRUD OPERATIONS =====

	async createFeature(
		ctx: AuthenticationContext,
		data: Omit<FeatureData, "uuid" | "createdTime" | "modifiedTime">,
	): Promise<Either<AntboxError, FeatureData>> {
		// Check admin permission
		if (!this.#isAdmin(ctx)) {
			return left(new ForbiddenError("Only admins can create features"));
		}

		const now = new Date().toISOString();
		const featureData: FeatureData = {
			uuid: UuidGenerator.generate(),
			...data,
			createdTime: now,
			modifiedTime: now,
		};

		// Validate with Zod schema
		const validation = FeatureDataSchema.safeParse(featureData);
		if (!validation.success) {
			const errors = validation.error.issues.map((e) =>
				new BadRequestError(`${e.path.join(".")}: ${e.message}`)
			);
			return left(ValidationError.from(...errors));
		}

		return this.#configRepo.save("features", featureData);
	}

	async getFeature(
		_ctx: AuthenticationContext,
		uuid: string,
	): Promise<Either<AntboxError, FeatureData>> {
		// Check builtin features first
		const builtinFeature = BUILTIN_FEATURES.find((f) => f.uuid === uuid);
		if (builtinFeature) {
			return right(builtinFeature);
		}

		return this.#configRepo.get("features", uuid);
	}

	async listFeatures(
		ctx: AuthenticationContext,
	): Promise<Either<AntboxError, FeatureData[]>> {
		const customFeaturesOrErr = await this.#configRepo.list("features");

		if (customFeaturesOrErr.isLeft()) {
			return customFeaturesOrErr;
		}

		// Combine builtin features with custom features
		const allFeatures = [...BUILTIN_FEATURES, ...customFeaturesOrErr.value];

		// Sort by title
		allFeatures.sort((a, b) => a.title.localeCompare(b.title));

		// Filter by allowed groups if not admin
		if (
			ctx.principal.email === Users.ROOT_USER_EMAIL ||
			ctx.principal.groups.includes(Groups.ADMINS_GROUP_UUID)
		) {
			return right(allFeatures);
		}

		return right(allFeatures.filter((f) => {
			if (!f.groupsAllowed?.length) {
				return true;
			}

			return f.groupsAllowed.some((g) => ctx.principal.groups.includes(g));
		}));
	}

	async updateFeature(
		ctx: AuthenticationContext,
		uuid: string,
		updates: Partial<Omit<FeatureData, "uuid" | "createdTime">>,
	): Promise<Either<AntboxError, FeatureData>> {
		// Check admin permission
		if (!this.#isAdmin(ctx)) {
			return left(new ForbiddenError("Only admins can update features"));
		}

		// Cannot update builtin features
		if (BUILTIN_FEATURES.some((f) => f.uuid === uuid)) {
			return left(new BadRequestError("Cannot update builtin features"));
		}

		const existingOrErr = await this.#configRepo.get("features", uuid);
		if (existingOrErr.isLeft()) {
			return existingOrErr;
		}

		const updatedData: FeatureData = {
			...existingOrErr.value,
			...updates,
			uuid, // Ensure UUID doesn't change
			createdTime: existingOrErr.value.createdTime, // Preserve creation time
			modifiedTime: new Date().toISOString(),
		};

		// Validate with Zod schema
		const validation = FeatureDataSchema.safeParse(updatedData);
		if (!validation.success) {
			const errors = validation.error.issues.map((e) =>
				new BadRequestError(`${e.path.join(".")}: ${e.message}`)
			);
			return left(ValidationError.from(...errors));
		}

		return this.#configRepo.save("features", updatedData);
	}

	async deleteFeature(
		ctx: AuthenticationContext,
		uuid: string,
	): Promise<Either<AntboxError, void>> {
		// Check admin permission
		if (!this.#isAdmin(ctx)) {
			return left(new ForbiddenError("Only admins can delete features"));
		}

		// Cannot delete builtin features
		if (BUILTIN_FEATURES.some((f) => f.uuid === uuid)) {
			return left(new BadRequestError("Cannot delete builtin features"));
		}

		return this.#configRepo.delete("features", uuid);
	}

	// ===== LISTING BY TYPE =====

	async listActions(
		ctx: AuthenticationContext,
	): Promise<Either<AntboxError, FeatureData[]>> {
		const featuresOrErr = await this.listFeatures(ctx);
		if (featuresOrErr.isLeft()) {
			return featuresOrErr;
		}

		return right(featuresOrErr.value.filter((f) => f.exposeAction));
	}

	async listAITools(
		ctx: AuthenticationContext,
	): Promise<Either<AntboxError, FeatureData[]>> {
		const featuresOrErr = await this.listFeatures(ctx);
		if (featuresOrErr.isLeft()) {
			return featuresOrErr;
		}

		return right(featuresOrErr.value.filter((f) => f.exposeAITool));
	}

	async listExtensions(
		ctx: AuthenticationContext,
	): Promise<Either<AntboxError, Partial<FeatureData>[]>> {
		const featuresOrErr = await this.listFeatures(ctx);
		if (featuresOrErr.isLeft()) {
			return featuresOrErr;
		}

		return right(featuresOrErr.value.filter((f) => f.exposeExtension));
	}

	async getAction(
		ctx: AuthenticationContext,
		uuid: string,
	): Promise<Either<AntboxError, FeatureData>> {
		const featureOrErr = await this.getFeature(ctx, uuid);
		if (featureOrErr.isLeft()) {
			return left(featureOrErr.value);
		}

		const feature = featureOrErr.value;
		if (!feature.exposeAction) {
			return left(new BadRequestError("Feature is not exposed as action"));
		}

		return right(feature);
	}

	async getAITool(
		ctx: AuthenticationContext,
		uuid: string,
	): Promise<Either<AntboxError, FeatureData>> {
		const featureOrErr = await this.getFeature(ctx, uuid);
		if (featureOrErr.isLeft()) {
			return left(featureOrErr.value);
		}

		const feature = featureOrErr.value;
		if (!feature.exposeAITool) {
			return left(new BadRequestError("Feature is not exposed as AI tool"));
		}

		return right(feature);
	}

	async getExtension(
		ctx: AuthenticationContext,
		uuid: string,
	): Promise<Either<AntboxError, FeatureData>> {
		const featureOrErr = await this.getFeature(ctx, uuid);
		if (featureOrErr.isLeft()) {
			return left(featureOrErr.value);
		}

		const feature = featureOrErr.value;
		if (!feature.exposeExtension) {
			return left(new BadRequestError("Feature is not exposed as extension"));
		}

		return right(feature);
	}

	#isAdmin(ctx: AuthenticationContext): boolean {
		return ctx.principal.groups.includes(ADMINS_GROUP_UUID);
	}
}
