import type { AntboxError } from "shared/antbox_error.ts";
import { BadRequestError, ForbiddenError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import { ValidationError } from "shared/validation_error.ts";
import type { AuthenticationContext } from "./authentication_context.ts";
import type { ConfigurationRepository } from "domain/configuration/configuration_repository.ts";
import type { GroupData } from "domain/configuration/group_data.ts";
import { GroupDataSchema } from "domain/configuration/group_schema.ts";
import {
	ADMINS_GROUP,
	ADMINS_GROUP_UUID,
	ANONYMOUS_GROUP,
	BUILTIN_GROUPS,
} from "domain/configuration/builtin_groups.ts";
import { UuidGenerator } from "shared/uuid_generator.ts";

/**
 * GroupsService - Manages user groups in the configuration repository
 * Separated from content management (NodeService)
 */
export class GroupsService {
	constructor(private readonly configRepo: ConfigurationRepository) {}

	async createGroup(
		ctx: AuthenticationContext,
		data: Omit<GroupData, "uuid" | "createdTime">,
	): Promise<Either<AntboxError, GroupData>> {
		// Check admin permission
		if (!this.#isAdmin(ctx)) {
			return left(new ForbiddenError("Only admins can create groups"));
		}

		const now = new Date().toISOString();
		const groupData: GroupData = {
			uuid: UuidGenerator.generate(),
			title: data.title,
			description: data.description,
			createdTime: now,
		};

		// Validate with Zod schema
		const validation = GroupDataSchema.safeParse(groupData);
		if (!validation.success) {
			const errors = validation.error.issues.map((e) =>
				new BadRequestError(`${e.path.join(".")}: ${e.message}`)
			);
			return left(ValidationError.from(...errors));
		}

		return this.configRepo.save("groups", groupData);
	}

	async getGroup(
		_ctx: AuthenticationContext,
		uuid: string,
	): Promise<Either<AntboxError, GroupData>> {
		// Check builtin groups first
		const builtinGroup = BUILTIN_GROUPS.find((g) => g.uuid === uuid);
		if (builtinGroup) {
			return right(builtinGroup);
		}

		return this.configRepo.get("groups", uuid);
	}

	async listGroups(
		_ctx: AuthenticationContext,
	): Promise<Either<AntboxError, GroupData[]>> {
		const customGroupsOrErr = await this.configRepo.list("groups");

		if (customGroupsOrErr.isLeft()) {
			return customGroupsOrErr;
		}

		// Combine builtin groups with custom groups
		const allGroups = [...BUILTIN_GROUPS, ...customGroupsOrErr.value];

		return right(allGroups);
	}

	async deleteGroup(
		ctx: AuthenticationContext,
		uuid: string,
	): Promise<Either<AntboxError, void>> {
		// Check admin permission
		if (!this.#isAdmin(ctx)) {
			return left(new ForbiddenError("Only admins can delete groups"));
		}

		// Cannot delete builtin groups
		if (BUILTIN_GROUPS.some((g) => g.uuid === uuid)) {
			return left(new BadRequestError("Cannot delete builtin groups"));
		}

		return this.configRepo.delete("groups", uuid);
	}

	#isAdmin(ctx: AuthenticationContext): boolean {
		return ctx.principal.groups.includes(ADMINS_GROUP_UUID);
	}
}
