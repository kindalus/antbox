import type { AntboxError } from "shared/antbox_error.ts";
import { BadRequestError, ForbiddenError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import { ValidationError } from "shared/validation_error.ts";
import type { AuthenticationContext } from "./authentication_context.ts";
import type { ConfigurationRepository } from "domain/configuration/configuration_repository.ts";
import type { ApiKeyData } from "domain/configuration/api_key_data.ts";
import { ApiKeyDataSchema } from "domain/configuration/api_key_schema.ts";
import { ADMINS_GROUP_UUID } from "domain/configuration/builtin_groups.ts";
import { BUILTIN_API_KEYS } from "domain/configuration/builtin_api_keys.ts";
import { UuidGenerator } from "shared/uuid_generator.ts";

/**
 * ApiKeysService - Manages API keys in the configuration repository
 * Separated from content management (NodeService)
 *
 * Note: API keys are not updated, only created and deleted
 */
export class ApiKeysService {
	constructor(private readonly configRepo: ConfigurationRepository) {}

	async createApiKey(
		ctx: AuthenticationContext,
		data: Omit<ApiKeyData, "uuid" | "secret" | "createdTime">,
	): Promise<Either<AntboxError, ApiKeyData>> {
		// Check admin permission
		if (!this.#isAdmin(ctx)) {
			return left(new ForbiddenError("Only admins can create API keys"));
		}

		const now = new Date().toISOString();
		const secret = UuidGenerator.generate() + UuidGenerator.generate(); // 16+ chars

		const apiKeyData: ApiKeyData = {
			uuid: UuidGenerator.generate(),
			secret,
			title: data.title || secret.substring(0, 4) + "******",
			group: data.group,
			description: data.description,
			active: data.active ?? true,
			createdTime: now,
		};

		// Validate with Zod schema
		const validation = ApiKeyDataSchema.safeParse(apiKeyData);
		if (!validation.success) {
			const errors = validation.error.issues.map((e) =>
				new BadRequestError(`${e.path.join(".")}: ${e.message}`)
			);
			return left(ValidationError.from(...errors));
		}

		return this.configRepo.save("apikeys", apiKeyData);
	}

	async getApiKey(
		ctx: AuthenticationContext,
		uuid: string,
	): Promise<Either<AntboxError, ApiKeyData>> {
		// Check builtin API keys first (currently none)
		const builtinApiKey = BUILTIN_API_KEYS.find((k) => k.uuid === uuid);
		if (builtinApiKey) {
			return right(builtinApiKey);
		}

		// Only admins can get API keys
		if (!this.#isAdmin(ctx)) {
			return left(new ForbiddenError("Only admins can access API keys"));
		}

		return this.configRepo.get("apikeys", uuid);
	}

	async getApiKeyBySecret(
		secret: string,
	): Promise<Either<AntboxError, ApiKeyData>> {
		// Check builtin API keys first (currently none)
		const builtinApiKey = BUILTIN_API_KEYS.find((k) => k.secret === secret);
		if (builtinApiKey) {
			return right(builtinApiKey);
		}

		// Search through all API keys for matching secret
		const apiKeysOrErr = await this.configRepo.list("apikeys");
		if (apiKeysOrErr.isLeft()) {
			return left(apiKeysOrErr.value);
		}

		const apiKey = apiKeysOrErr.value.find((k) => k.secret === secret);
		if (!apiKey) {
			return left(new BadRequestError(`API key with secret not found`));
		}

		return right(apiKey);
	}

	async listApiKeys(
		ctx: AuthenticationContext,
	): Promise<Either<AntboxError, ApiKeyData[]>> {
		// Only admins can list API keys
		if (!this.#isAdmin(ctx)) {
			return left(new ForbiddenError("Only admins can list API keys"));
		}

		const customApiKeysOrErr = await this.configRepo.list("apikeys");

		if (customApiKeysOrErr.isLeft()) {
			return customApiKeysOrErr;
		}

		// Combine builtin API keys with custom API keys, sorted by title
		const allApiKeys = [...BUILTIN_API_KEYS, ...customApiKeysOrErr.value];
		allApiKeys.sort((a, b) => a.title.localeCompare(b.title));

		return right(allApiKeys);
	}

	async deleteApiKey(
		ctx: AuthenticationContext,
		uuid: string,
	): Promise<Either<AntboxError, void>> {
		// Check admin permission
		if (!this.#isAdmin(ctx)) {
			return left(new ForbiddenError("Only admins can delete API keys"));
		}

		// Cannot delete builtin API keys (currently none, but future-proof)
		if (BUILTIN_API_KEYS.some((k) => k.uuid === uuid)) {
			return left(new BadRequestError("Cannot delete builtin API keys"));
		}

		return this.configRepo.delete("apikeys", uuid);
	}

	#isAdmin(ctx: AuthenticationContext): boolean {
		return ctx.principal.groups.includes(ADMINS_GROUP_UUID);
	}
}
