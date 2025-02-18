import { GroupNode } from "../domain/auth/group_node.ts";
import GroupNotFoundError from "../domain/auth/group_not_found_error.ts";
import { Groups } from "../domain/auth/groups.ts";
import { UserExistsError } from "../domain/auth/user_exists_error.ts";
import { UserNode } from "../domain/auth/user_node.ts";
import { UserNotFoundError } from "../domain/auth/user_not_found_error.ts";
import { Users } from "../domain/auth/users.ts";
import { Folders } from "../domain/nodes/folders.ts";
import { Nodes } from "../domain/nodes/nodes.ts";
import { AntboxError, BadRequestError, ForbiddenError } from "../shared/antbox_error.ts";
import { Either, left, right } from "../shared/either.ts";
import { ValidationError } from "../shared/validation_error.ts";
import { AuthenticationContext } from "./authentication_context.ts";
import { Admins } from "./builtin_groups/admins.ts";
import { builtinGroups } from "./builtin_groups/mod.ts";
import { Anonymous } from "./builtin_users/anonymous.ts";
import { builtinUsers } from "./builtin_users/mod.ts";
import { Root } from "./builtin_users/root.ts";
import { InvalidCredentialsError } from "./invalid_credentials_error.ts";
import { NodeService } from "./node_service.ts";

export class AuthService {
	static elevatedContext(tenant?: string): AuthenticationContext {
		return {
			mode: "Direct",
			tenant: tenant ?? "default",
			principal: {
				email: Users.ROOT_USER_EMAIL,
				groups: [Groups.ADMINS_GROUP_UUID],
			},
		};
	}

	constructor(private readonly nodeService: NodeService) {}

	async createUser(
		ctx: AuthenticationContext,
		metadata: Partial<UserNode>,
	): Promise<Either<AntboxError, UserNode>> {
		const groups: Set<string> = new Set();
		metadata.groups?.forEach(groups.add);

		const userOrErr = UserNode.create({ ...metadata, groups: Array.from(groups) });

		if (userOrErr.isLeft()) {
			return left(userOrErr.value);
		}

		const existingOrErr = await this.getUserByEmail(ctx, metadata.email!);
		if (existingOrErr.isRight()) {
			return left(new UserExistsError(metadata.email!));
		}

		const user = userOrErr.value;

		if (groups) {
			const batch = user.groups.map((group) => this.getGroup(ctx, group));
			const groupsOrErr = await Promise.all(batch);
			const groupsErr = groupsOrErr.filter((groupOrErr) => groupOrErr.isLeft());
			if (groupsErr.length > 0) {
				const errs = groupsErr.map((groupOrErr) => groupOrErr.value);
				return left(ValidationError.from(...errs));
			}
		}

		return this.nodeService.create(ctx, metadata);
	}

	async getUser(
		ctx: AuthenticationContext,
		uuid: string,
	): Promise<Either<AntboxError, UserNode>> {
		if (uuid === Users.ROOT_USER_UUID) {
			return this.#hasAdminGroup(ctx) ? right(Root) : left(new ForbiddenError());
		}

		if (uuid === Users.ANONYMOUS_USER_UUID) {
			return right(Anonymous);
		}

		const nodeOrErr = await this.nodeService.get(AuthService.elevatedContext(ctx.tenant), uuid);

		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}

		const user = nodeOrErr.value;
		if (!Nodes.isUser(user)) {
			return left(new UserNotFoundError(uuid));
		}

		if (user.email === ctx.principal.email) {
			return right(user);
		}

		return ctx.principal.groups.includes(Groups.ADMINS_GROUP_UUID)
			? right(user)
			: left(new ForbiddenError());
	}

	async getUserByEmail(
		ctx: AuthenticationContext,
		email: string,
	): Promise<Either<AntboxError, UserNode>> {
		if (email === Users.ROOT_USER_EMAIL) {
			ctx.principal.groups.includes(Groups.ADMINS_GROUP_UUID)
				? right(Root)
				: left(new ForbiddenError());
		}

		if (email === Users.ANONYMOUS_USER_EMAIL) {
			return right(Anonymous);
		}

		const nodeOrErr = await this.nodeService.find(
			ctx,
			[
				["email", "==", email],
				["mimetype", "==", Nodes.USER_MIMETYPE],
			],
			1,
			1,
		);

		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}

		if (nodeOrErr.value.nodes.length === 0) {
			return left(new UserNotFoundError(email));
		}

		const user = nodeOrErr.value.nodes[0];
		if (!Nodes.isUser(user)) {
			return left(new UserNotFoundError(email));
		}

		if (user.email === ctx.principal.email) {
			return right(user);
		}

		return ctx.principal.groups.includes(Groups.ADMINS_GROUP_UUID)
			? right(user)
			: left(new ForbiddenError());
	}

	async getUserByCredentials(
		email: string,
		password: string,
	): Promise<Either<AntboxError, UserNode>> {
		const hash = await UserNode.shaSum(email, password);

		const result = await this.nodeService.find(AuthService.elevatedContext(), [[
			"secret",
			"==",
			hash,
		]]);

		if (result.isLeft()) {
			return left(result.value);
		}

		if (result.value.nodes.length === 0) {
			return left(new InvalidCredentialsError());
		}

		const node = result.value.nodes[0];

		if (!Nodes.isUser(node)) {
			return left(new InvalidCredentialsError());
		}

		return right(node);
	}

	async listUsers(ctx: AuthenticationContext): Promise<Either<ForbiddenError, UserNode[]>> {
		const nodesOrErrs = await this.nodeService.find(ctx, [
			["mimetype", "==", Nodes.USER_MIMETYPE],
			["parent", "==", Folders.USERS_FOLDER_UUID],
		], Number.MAX_SAFE_INTEGER);
		if (nodesOrErrs.isLeft()) {
			console.error(nodesOrErrs.value);
			return right([]);
		}

		const users = nodesOrErrs.value.nodes as UserNode[];
		const systemUsers = builtinUsers;

		return right([...users, ...systemUsers].sort((a, b) => a.title.localeCompare(b.title)));
	}

	async updateUser(
		ctx: AuthenticationContext,
		uuid: string,
		data: Partial<UserNode>,
	): Promise<Either<AntboxError, void>> {
		if (uuid === Users.ROOT_USER_UUID || uuid === Users.ANONYMOUS_USER_UUID) {
			return left(new BadRequestError("Cannot update built-in user"));
		}

		const existingOrErr = await this.getUser(ctx, uuid);
		if (existingOrErr.isLeft()) {
			return left(existingOrErr.value);
		}

		const user = existingOrErr.value;
		const errors: AntboxError[] = [];

		if (data.title) {
			const voidOrErr = user.changeTitle(data.title);
			if (voidOrErr.isLeft()) {
				errors.push(...voidOrErr.value.errors);
			}
		}

		if (data.group) {
			const voidOrErr = user.changeGroup(data.group);
			if (voidOrErr.isLeft()) {
				errors.push(...voidOrErr.value.errors);
			}
		}

		if (data.groups) {
			const voidOrErr = user.changeGroups(data.groups);
			if (voidOrErr.isLeft()) {
				errors.push(...voidOrErr.value.errors);
			}
		}

		if (errors.length > 0) {
			return left(ValidationError.from(...errors));
		}

		return this.nodeService.update(AuthService.elevatedContext(ctx.tenant), uuid, user);
	}

	async deleteUser(ctx: AuthenticationContext, uuid: string): Promise<Either<AntboxError, void>> {
		if (uuid === Users.ROOT_USER_UUID || uuid === Users.ANONYMOUS_USER_UUID) {
			return left(new BadRequestError("Cannot delete built-in user"));
		}

		const existingOrErr = await this.getUser(ctx, uuid);
		if (existingOrErr.isLeft()) {
			return left(existingOrErr.value);
		}

		return this.nodeService.delete(ctx, uuid);
	}

	// async changePassword(ctx: AuthenticationContext, uuid: string, password: string): Promise<Either<AntboxError, void>> {

	// }
	//

	// Groups
	createGroup(
		ctx: AuthenticationContext,
		groupNode: Partial<GroupNode>,
	): Promise<Either<AntboxError, GroupNode>> {
		const groupOrErr = GroupNode.create(groupNode);
		if (groupOrErr.isLeft()) {
			return Promise.resolve(left(groupOrErr.value));
		}

		const group = groupOrErr.value;
		return this.nodeService.create(ctx, group);
	}

	async getGroup(
		ctx: AuthenticationContext,
		uuid: string,
	): Promise<Either<AntboxError, GroupNode>> {
		if (uuid === Groups.ADMINS_GROUP_UUID) {
			return right(Admins);
		}

		const nodeOrErr = await this.nodeService.get(ctx, uuid);
		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}

		if (!Nodes.isGroup(nodeOrErr.value)) {
			return left(new GroupNotFoundError(uuid));
		}

		return right(nodeOrErr.value);
	}

	async listGroups(ctx: AuthenticationContext): Promise<GroupNode[]> {
		const nodesOrErrs = await this.nodeService.find(ctx, [
			["mimetype", "==", Nodes.GROUP_MIMETYPE],
			["parent", "==", Folders.GROUPS_FOLDER_UUID],
		], Number.MAX_SAFE_INTEGER);
		if (nodesOrErrs.isLeft()) {
			console.error(nodesOrErrs.value);
			return [];
		}

		const groups = nodesOrErrs.value.nodes as GroupNode[];

		return [...groups, ...builtinGroups].sort((a, b) => a.title.localeCompare(b.title));
	}

	async updateGroup(
		ctx: AuthenticationContext,
		uuid: string,
		data: Partial<GroupNode>,
	): Promise<Either<AntboxError, void>> {
		if (builtinGroups.find((group) => group.uuid === uuid)) {
			return left(new BadRequestError("Cannot update built-in group"));
		}

		const existingOrErr = await this.getGroup(ctx, uuid);
		if (existingOrErr.isLeft()) {
			return left(existingOrErr.value);
		}

		const group = existingOrErr.value;

		if (data.title) {
			const voidOrErr = group.changeTitle(data.title);
			if (voidOrErr.isLeft()) {
				return left(voidOrErr.value);
			}
		}

		return this.nodeService.update(ctx, uuid, group);
	}

	deleteGroup(ctx: AuthenticationContext, uuid: string): Promise<Either<AntboxError, void>> {
		if (uuid === Groups.ADMINS_GROUP_UUID) {
			return Promise.resolve(
				left(new BadRequestError("Cannot delete admins group")),
			);
		}
		return this.nodeService.delete(ctx, uuid);
	}

	#hasAdminGroup(ctx: AuthenticationContext): boolean {
		return ctx.principal.groups.includes(Groups.ADMINS_GROUP_UUID);
	}
}
