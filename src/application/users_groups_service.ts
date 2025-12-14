import { Folders } from "domain/nodes/folders.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { GroupNode } from "domain/users_groups/group_node.ts";
import GroupNotFoundError from "domain/users_groups/group_not_found_error.ts";
import { Groups } from "domain/users_groups/groups.ts";
import { UserExistsError } from "domain/users_groups/user_exists_error.ts";
import { UserNode } from "domain/users_groups/user_node.ts";
import { UserNotFoundError } from "domain/users_groups/user_not_found_error.ts";
import { Users } from "domain/users_groups/users.ts";
import { type AntboxError, BadRequestError, ForbiddenError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import { ValidationError } from "shared/validation_error.ts";
import type { AuthenticationContext } from "./authentication_context.ts";
import { ADMINS_GROUP, builtinGroups } from "./builtin_groups/index.ts";
import { ANONYMOUS_USER, builtinUsers, ROOT_USER } from "./builtin_users/index.ts";
import {
	type GroupDTO,
	groupToNode,
	nodeToGroup,
	nodeToUser,
	type UserDTO,
	userToNode,
} from "./users_groups_dto.ts";

import type { NodeMetadata } from "domain/nodes/node_metadata.ts";
import type { NodeService } from "./node_service.ts";
import type { NodeLike } from "domain/node_like.ts";

export class UsersGroupsService {
	static elevatedContext: AuthenticationContext = {
		mode: "Action",
		principal: {
			email: Users.ROOT_USER_EMAIL,
			groups: [Groups.ADMINS_GROUP_UUID],
		},
		tenant: "default",
	};

	readonly service: NodeService;

	constructor(service: NodeService) {
		this.service = service;
	}

	async createUser(
		ctx: AuthenticationContext,
		metadata: Partial<UserDTO>,
	): Promise<Either<AntboxError, UserDTO>> {
		const existingOrErr = await this.getUser(ctx, metadata.email!);
		if (existingOrErr.isRight()) {
			return left(ValidationError.from(new UserExistsError(metadata.email!)));
		}

		const groups = new Set(metadata.groups ?? []);

		const userOrErr = UserNode.create({
			...metadata,
			title: metadata.name,
			owner: ctx.principal.email,
			group: Array.from(groups)[0],
			groups: Array.from(groups).slice(1),
		});

		if (userOrErr.isLeft()) {
			return left(userOrErr.value);
		}

		if (groups.size > 0) {
			const batch = metadata.groups?.map((group) => this.getGroup(ctx, group));

			const groupsOrErr = await Promise.all(batch!);

			const groupsErr = groupsOrErr.filter((groupOrErr) => groupOrErr.isLeft());

			if (groupsErr.length > 0) {
				const errs = groupsErr.map((groupOrErr) => groupOrErr.value);
				return left(ValidationError.from(...errs));
			}
		}

		const user = userOrErr.value;

		const voidOrErr = await this.service.create(ctx, user.metadata);
		if (voidOrErr.isLeft()) {
			return left(voidOrErr.value);
		}

		return right(nodeToUser(user));
	}

	async getUser(
		ctx: AuthenticationContext,
		email: string,
	): Promise<Either<AntboxError, UserDTO>> {
		if (email === Users.ROOT_USER_EMAIL) {
			return (await this.#hasAdminGroup(ctx))
				? right(nodeToUser(ROOT_USER))
				: left(new ForbiddenError());
		}

		if (email === Users.ANONYMOUS_USER_EMAIL) {
			return right(nodeToUser(ANONYMOUS_USER));
		}

		const result = await this.service.find(ctx, [
			["email", "==", email],
			["mimetype", "==", Nodes.USER_MIMETYPE],
		]);

		if (result.isLeft() || result.value.nodes.length === 0) {
			return left(new UserNotFoundError(email));
		}

		const node = result.value.nodes[0] as UserNode;

		if (node.email === ctx.principal.email) {
			return right(nodeToUser(node));
		}

		return (await this.#hasAdminGroup(ctx))
			? right(nodeToUser(node))
			: left(new ForbiddenError());
	}

	async updateUser(
		ctx: AuthenticationContext,
		email: string,
		metadata: Partial<UserDTO>,
	): Promise<Either<AntboxError, void>> {
		if (
			email === Users.ROOT_USER_EMAIL || email === Users.ANONYMOUS_USER_EMAIL
		) {
			return left(new BadRequestError("Cannot update built-in user"));
		}

		const existingOrErr = await this.getUser(ctx, email);
		if (existingOrErr.isLeft()) {
			return left(existingOrErr.value);
		}

		const voidOrErr = await this.service.update(ctx, existingOrErr.value.uuid, metadata);
		if (voidOrErr.isLeft()) {
			return left(voidOrErr.value);
		}

		return right(voidOrErr.value);
	}

	async deleteUser(ctx: AuthenticationContext, uuid: string): Promise<Either<AntboxError, void>> {
		if (uuid === Users.ROOT_USER_UUID || uuid === Users.ANONYMOUS_USER_UUID) {
			return left(new BadRequestError("Cannot delete built-in user"));
		}

		const existingOrErr = await this.service.get(ctx, uuid);
		if (existingOrErr.isLeft()) {
			return left(new UserNotFoundError(uuid));
		}

		const voidOrErr = await this.service.delete(ctx, uuid);
		if (voidOrErr.isLeft()) {
			return left(voidOrErr.value);
		}

		return right(voidOrErr.value);
	}

	async listUsers(ctx: AuthenticationContext): Promise<Either<AntboxError, UserDTO[]>> {
		const usersOrErr = await this.service.find(ctx, [
			["mimetype", "==", Nodes.USER_MIMETYPE],
			["parent", "==", Folders.USERS_FOLDER_UUID],
		], Number.MAX_SAFE_INTEGER);

		if (usersOrErr.isLeft()) {
			return left(usersOrErr.value);
		}

		const users = (usersOrErr.value.nodes as UserNode[]).map(nodeToUser);
		const sytemUsers = builtinUsers.map(nodeToUser);

		return right(
			[...users, ...sytemUsers].sort((a, b) => a.name.localeCompare(b.name)),
		);
	}

	#hasAdminGroup(ctx: AuthenticationContext): Promise<boolean> {
		return Promise.resolve(
			ctx.principal.groups.includes(Groups.ADMINS_GROUP_UUID),
		);
	}

	async createGroup(
		ctx: AuthenticationContext,
		metadata: GroupDTO,
	): Promise<Either<AntboxError, GroupDTO>> {
		const groupOrErr = GroupNode.create({
			...metadata,
			owner: ctx.principal.email,
		});

		if (groupOrErr.isLeft()) {
			return left(groupOrErr.value);
		}

		const group = groupOrErr.value;

		const voidOrErr = await this.service.create(ctx, group.metadata);
		if (voidOrErr.isLeft()) {
			return left(voidOrErr.value);
		}

		return right(nodeToGroup(group));
	}

	async getGroup(
		ctx: AuthenticationContext,
		uuid: string,
	): Promise<Either<AntboxError, GroupNode>> {
		if (uuid === Groups.ADMINS_GROUP_UUID) {
			return right(ADMINS_GROUP);
		}

		const groupOrErr = await this.service.get(ctx, uuid);

		if (groupOrErr.isLeft()) {
			return left(groupOrErr.value);
		}

		const group = groupOrErr.value;

		if (!Nodes.isGroup(group as unknown as NodeLike)) {
			return left(new GroupNotFoundError(uuid));
		}

		return right(group as unknown as GroupNode);
	}

	async updateGroup(
		ctx: AuthenticationContext,
		uuid: string,
		metadata: Partial<GroupDTO>,
	): Promise<Either<AntboxError, void>> {
		if (builtinGroups.find((group) => group.uuid === uuid)) {
			return left(new BadRequestError("Cannot update built-in group"));
		}

		const existingOrErr = await this.getGroup(ctx, uuid);
		if (existingOrErr.isLeft()) {
			return left(existingOrErr.value);
		}

		const voidOrErr = await this.service.update(ctx, uuid, metadata);
		if (voidOrErr.isLeft()) {
			return left(voidOrErr.value);
		}

		return right(voidOrErr.value);
	}

	async deleteGroup(
		ctx: AuthenticationContext,
		uuid: string,
	): Promise<Either<AntboxError, void>> {
		if (uuid === Groups.ADMINS_GROUP_UUID) {
			return left(new BadRequestError("Cannot delete admins group"));
		}

		const existingOrErr = await this.getGroup(ctx, uuid);
		if (existingOrErr.isLeft()) {
			return left(existingOrErr.value);
		}

		const voidOrErr = await this.service.delete(ctx, uuid);
		if (voidOrErr.isLeft()) {
			return left(voidOrErr.value);
		}

		return right(voidOrErr.value);
	}

	async listGroups(ctx: AuthenticationContext): Promise<Either<AntboxError, GroupDTO[]>> {
		const groupsOrErr = await this.service.find(ctx, [
			["mimetype", "==", Nodes.GROUP_MIMETYPE],
			["parent", "==", Folders.GROUPS_FOLDER_UUID],
		], Number.MAX_SAFE_INTEGER);

		if (groupsOrErr.isLeft()) {
			return left(groupsOrErr.value);
		}

		const groups = groupsOrErr.value.nodes.map(nodeToGroup);
		const systemGroups = builtinGroups.map(nodeToGroup);

		const _groups = [...groups, ...systemGroups]
			.sort((a, b) => a.title.localeCompare(b.title));

		return right(_groups);
	}
}
