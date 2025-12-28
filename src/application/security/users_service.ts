import type { AntboxError } from "shared/antbox_error.ts";
import { BadRequestError, ForbiddenError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import { ValidationError } from "shared/validation_error.ts";
import type { AuthenticationContext } from "./authentication_context.ts";
import type { ConfigurationRepository } from "domain/configuration/configuration_repository.ts";
import type { UserData } from "domain/configuration/user_data.ts";
import { UserDataSchema } from "domain/configuration/user_schema.ts";
import { ADMINS_GROUP_UUID } from "domain/configuration/builtin_groups.ts";
import {
	ANONYMOUS_USER,
	ANONYMOUS_USER_EMAIL,
	BUILTIN_USERS,
	LOCK_SYSTEM_USER,
	LOCK_SYSTEM_USER_EMAIL,
	ROOT_USER,
	ROOT_USER_EMAIL,
	WORKFLOW_INSTANCE_USER,
	WORKFLOW_INSTANCE_USER_EMAIL,
} from "domain/configuration/builtin_users.ts";

/**
 * UsersService - Manages users in the configuration repository
 * Separated from content management (NodeService)
 *
 * Note: Users are identified by email (email serves as UUID)
 */
export class UsersService {
	constructor(private readonly configRepo: ConfigurationRepository) {}

	async createUser(
		ctx: AuthenticationContext,
		metadata: Partial<UserData>,
	): Promise<Either<AntboxError, UserData>> {
		// Check admin permission
		if (!this.#isAdmin(ctx)) {
			return left(new ForbiddenError("Only admins can create users"));
		}

		if (!metadata.email) {
			return left(new BadRequestError("Email is required"));
		}

		// Check if user already exists
		const existingOrErr = await this.configRepo.get("users", metadata.email);
		if (existingOrErr.isRight()) {
			return left(new BadRequestError(`User with email '${metadata.email}' already exists`));
		}

		const now = new Date().toISOString();
		const userData: UserData = {
			email: metadata.email,
			title: metadata.title || metadata.email,
			group: metadata.group || "",
			groups: metadata.groups || [],
			hasWhatsapp: metadata.hasWhatsapp ?? false,
			active: metadata.active ?? true,
			phone: metadata.phone,
			createdTime: now,
			modifiedTime: now,
		};

		// Validate with Zod schema
		const validation = UserDataSchema.safeParse(userData);
		if (!validation.success) {
			const errors = validation.error.issues.map((e) =>
				new BadRequestError(`${e.path.join(".")}: ${e.message}`)
			);
			return left(ValidationError.from(...errors));
		}

		return this.configRepo.save("users", userData);
	}

	async getUser(
		ctx: AuthenticationContext,
		email: string,
	): Promise<Either<AntboxError, UserData>> {
		// Check builtin users first
		const builtinUser = BUILTIN_USERS.find((u) => u.email === email);
		if (builtinUser) {
			// Root user can only be accessed by admins
			if (email === ROOT_USER_EMAIL && !this.#isAdmin(ctx)) {
				return left(new ForbiddenError("Only admins can access root user"));
			}
			return right(builtinUser);
		}

		const userOrErr = await this.configRepo.get("users", email);
		if (userOrErr.isLeft()) {
			return userOrErr;
		}

		// Users can access their own data, admins can access any user
		if (ctx.principal.email === email || this.#isAdmin(ctx)) {
			return userOrErr;
		}

		return left(new ForbiddenError("You can only access your own user data"));
	}

	async listUsers(
		ctx: AuthenticationContext,
	): Promise<Either<AntboxError, UserData[]>> {
		// Only admins can list all users
		if (!this.#isAdmin(ctx)) {
			return left(new ForbiddenError("Only admins can list users"));
		}

		const customUsersOrErr = await this.configRepo.list("users");

		if (customUsersOrErr.isLeft()) {
			return customUsersOrErr;
		}

		// Combine builtin users with custom users, sorted by title
		const allUsers = [...BUILTIN_USERS, ...customUsersOrErr.value];
		allUsers.sort((a, b) => a.title.localeCompare(b.title));

		return right(allUsers);
	}

	async updateUser(
		ctx: AuthenticationContext,
		email: string,
		metadata: Partial<UserData>,
	): Promise<Either<AntboxError, void>> {
		// Cannot update builtin users
		if (BUILTIN_USERS.some((u) => u.email === email)) {
			return left(new BadRequestError("Cannot update builtin users"));
		}

		const existingOrErr = await this.configRepo.get("users", email);
		if (existingOrErr.isLeft()) {
			return left(existingOrErr.value);
		}

		// Users can update their own data, admins can update any user
		if (ctx.principal.email !== email && !this.#isAdmin(ctx)) {
			return left(new ForbiddenError("You can only update your own user data"));
		}

		const updatedData: UserData = {
			...existingOrErr.value,
			...metadata,
			email, // Ensure email doesn't change
			createdTime: existingOrErr.value.createdTime, // Preserve creation time
			modifiedTime: new Date().toISOString(),
		};

		// Validate with Zod schema
		const validation = UserDataSchema.safeParse(updatedData);
		if (!validation.success) {
			const errors = validation.error.issues.map((e) =>
				new BadRequestError(`${e.path.join(".")}: ${e.message}`)
			);
			return left(ValidationError.from(...errors));
		}

		const result = await this.configRepo.save("users", updatedData);
		return result.isRight() ? right(undefined) : left(result.value);
	}

	async deleteUser(
		ctx: AuthenticationContext,
		email: string,
	): Promise<Either<AntboxError, void>> {
		// Check admin permission
		if (!this.#isAdmin(ctx)) {
			return left(new ForbiddenError("Only admins can delete users"));
		}

		// Cannot delete builtin users
		if (BUILTIN_USERS.some((u) => u.email === email)) {
			return left(new BadRequestError("Cannot delete builtin users"));
		}

		return this.configRepo.delete("users", email);
	}

	#isAdmin(ctx: AuthenticationContext): boolean {
		return ctx.principal.groups.includes(ADMINS_GROUP_UUID);
	}
}
