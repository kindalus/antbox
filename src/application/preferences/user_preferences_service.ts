import type { AuthenticationContext } from "application/security/authentication_context.ts";
import type { ConfigurationRepository } from "domain/configuration/configuration_repository.ts";
import type { UserPreferencesData } from "domain/configuration/user_preferences_data.ts";
import { UserPreferencesDataSchema } from "domain/configuration/user_preferences_schema.ts";
import { type AntboxError, BadRequestError, NotFoundError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import { ValidationError } from "shared/validation_error.ts";

export interface CreateUserPreferencesData {
	readonly preferences: Record<string, unknown>;
}

export interface UpdateUserPreferencesData {
	readonly preferences: Record<string, unknown>;
}

export class UserPreferencesService {
	constructor(private readonly configRepo: ConfigurationRepository) {}

	async createUserPreferences(
		ctx: AuthenticationContext,
		data: CreateUserPreferencesData,
	): Promise<Either<AntboxError, UserPreferencesData>> {
		const email = ctx.principal.email;
		const existingOrErr = await this.configRepo.get("userPreferences", email);
		if (existingOrErr.isRight()) {
			return left(new BadRequestError(`User preferences for '${email}' already exist`));
		}

		const userPreferences: UserPreferencesData = {
			email,
			preferences: data.preferences,
		};

		const validation = this.#validate(userPreferences);
		if (validation.isLeft()) {
			return left(validation.value);
		}

		return this.configRepo.save("userPreferences", userPreferences);
	}

	async getUserPreferences(
		ctx: AuthenticationContext,
	): Promise<Either<AntboxError, UserPreferencesData>> {
		const email = ctx.principal.email;
		const existingOrErr = await this.configRepo.get("userPreferences", email);
		if (existingOrErr.isLeft()) {
			return right({ email, preferences: {} });
		}

		return existingOrErr;
	}

	async updateUserPreferences(
		ctx: AuthenticationContext,
		data: UpdateUserPreferencesData,
	): Promise<Either<AntboxError, UserPreferencesData>> {
		const currentOrErr = await this.getUserPreferences(ctx);
		if (currentOrErr.isLeft()) {
			return currentOrErr;
		}

		const updated: UserPreferencesData = {
			email: currentOrErr.value.email,
			preferences: {
				...currentOrErr.value.preferences,
				...data.preferences,
			},
		};

		const validation = this.#validate(updated);
		if (validation.isLeft()) {
			return left(validation.value);
		}

		return this.configRepo.save("userPreferences", updated);
	}

	async deleteUserPreferences(
		ctx: AuthenticationContext,
	): Promise<Either<AntboxError, void>> {
		const email = ctx.principal.email;
		const existingOrErr = await this.configRepo.get("userPreferences", email);
		if (existingOrErr.isLeft()) {
			return right(undefined);
		}

		return this.configRepo.delete("userPreferences", email);
	}

	async getPreference(
		ctx: AuthenticationContext,
		key: string,
	): Promise<Either<AntboxError, unknown>> {
		const email = ctx.principal.email;
		const existingOrErr = await this.configRepo.get("userPreferences", email);
		if (existingOrErr.isLeft()) {
			return left(new NotFoundError(`Preference '${key}' not found`));
		}

		if (!Object.hasOwn(existingOrErr.value.preferences, key)) {
			return left(new NotFoundError(`Preference '${key}' not found`));
		}

		return right(existingOrErr.value.preferences[key]);
	}

	#validate(data: UserPreferencesData): Either<AntboxError, UserPreferencesData> {
		const validation = UserPreferencesDataSchema.safeParse(data);
		if (!validation.success) {
			const errors = validation.error.issues.map((issue) =>
				new BadRequestError(`${issue.path.join(".")}: ${issue.message}`)
			);
			return left(ValidationError.from(...errors));
		}

		return right(data);
	}
}
