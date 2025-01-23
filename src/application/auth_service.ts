import { Group } from "../domain/auth/group.ts";
import { GroupNode } from "../domain/auth/group_node.ts";
import GroupNotFoundError from "../domain/auth/group_not_found_error.ts";
import { GroupSpec } from "../domain/auth/group_spec.ts";
import { Groups } from "../domain/auth/groups.ts";
import { UserExistsError } from "../domain/auth/user_exists_error.ts";
import { UserNode } from "../domain/auth/user_node.ts";
import { UserNotFoundError } from "../domain/auth/user_not_found_error.ts";
import { UserSpec } from "../domain/auth/user_spec.ts";
import { Users } from "../domain/auth/users.ts";
import { Nodes } from "../domain/nodes/nodes.ts";
import { AntboxError, BadRequestError } from "../shared/antbox_error.ts";
import { Either, left, right } from "../shared/either.ts";
import { Admins } from "./builtin_groups/admins.ts";
import { builtinGroups } from "./builtin_groups/mod.ts";
import { Anonymous } from "./builtin_users/anonymous.ts";
import { builtinUsers } from "./builtin_users/mod.ts";
import { Root } from "./builtin_users/root.ts";
import { groupToNode, nodeToGroup } from "./node_mapper.ts";
import { NodeService } from "./node_service.ts";

export class AuthService {
	#userSpec = UserSpec;
	#groupSpec = new GroupSpec();

	constructor(private readonly nodeService: NodeService) {}

	async createUser(
		user: Partial<UserNode>,
	): Promise<Either<AntboxError, UserNode>> {
		const trueOrErr = this.#userSpec.isSatisfiedBy(user as UserNode);
		if (trueOrErr.isLeft()) {
			return left(trueOrErr.value);
		}

		const existingOrErr = await this.getUserByEmail(user.email!);
		if (existingOrErr.isRight()) {
			return left(new UserExistsError(user.email!));
		}

		const groups: string[] = [];
		user.groups?.forEach((group) => {
			if (!groups.includes(group)) groups.push(group);
		});
		if (!groups.includes(user.group!)) groups.push(user.group!);
		groups.sort((a, b) => a.localeCompare(b));

		const clenanedUser = {
			title: user.title,
			email: user.email,
			group: user.group,
			groups: groups,
			owner: user.owner,
			mimetype: Nodes.USER_MIMETYPE,
			parent: Nodes.USERS_FOLDER_UUID,
		};

		const nodeOrErr = await this.nodeService.create(clenanedUser);

		return nodeOrErr as Either<AntboxError, UserNode>;
	}

	async getUser(uuid: string): Promise<Either<AntboxError, UserNode>> {
		if (uuid === Users.ROOT_USER_UUID) {
			return right(Root);
		}

		if (uuid === Users.ANONYMOUS_USER_UUID) {
			return right(Anonymous);
		}

		const nodeOrErr = await this.nodeService.get(uuid);

		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}

		const node = nodeOrErr.value;
		if (!node.isUser()) {
			return left(new UserNotFoundError(uuid));
		}

		return right(node as UserNode);
	}

	async getUserByEmail(email: string): Promise<Either<AntboxError, UserNode>> {
		if (email === Users.ROOT_USER_EMAIL) {
			return right(Root);
		}

		if (email === Users.ANONYMOUS_USER_EMAIL) {
			return right(Anonymous);
		}

		const nodeOrErr = await this.nodeService.find(
			[["email", "==", email], ["mimetype", "==", Nodes.USER_MIMETYPE]],
			1,
			1,
		);

		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}

		if (nodeOrErr.value.nodes.length === 0) {
			return left(new UserNotFoundError(email));
		}

		const node = nodeOrErr.value.nodes[0];
		if (!node.isUser()) {
			return left(new UserNotFoundError(email));
		}

		return right(node as UserNode);
	}

	async listUsers(): Promise<UserNode[]> {
		const nodesOrErrs = await this.nodeService.find(
			[["mimetype", "==", Nodes.USER_MIMETYPE], ["parent", "==", Nodes.USERS_FOLDER_UUID]],
			Number.MAX_SAFE_INTEGER,
		);
		if (nodesOrErrs.isLeft()) {
			console.error(nodesOrErrs.value);
			return [];
		}

		const users = nodesOrErrs.value.nodes as UserNode[];
		const systemUsers = builtinUsers;

		return [
			...users,
			...systemUsers,
		].sort((a, b) => a.title.localeCompare(b.title));
	}

	async updateUser(uuid: string, data: Partial<UserNode>): Promise<Either<AntboxError, void>> {
		if (uuid === Users.ROOT_USER_UUID || uuid === Users.ANONYMOUS_USER_UUID) {
			return left(new BadRequestError("Cannot update built-in user"));
		}

		const fields = ["title", "group", "groups"];

		const existingOrErr = await this.getUser(uuid);
		if (existingOrErr.isLeft()) {
			return left(existingOrErr.value);
		}

		const existing = existingOrErr.value;
		const user: Record<string, unknown> = {};
		Object.entries(data).forEach(([key, value]) => {
			if (fields.includes(key)) user[key] = value;
		});

		const merged = Object.assign(existing, user);

		const trueOrErr = this.#userSpec.isSatisfiedBy(merged);
		if (trueOrErr.isLeft()) {
			return Promise.resolve(left(trueOrErr.value));
		}

		return this.nodeService.update(uuid, user);
	}

	async deleteUser(uuid: string): Promise<Either<AntboxError, void>> {
		if (uuid === Users.ROOT_USER_UUID || uuid === Users.ANONYMOUS_USER_UUID) {
			return left(new BadRequestError("Cannot delete built-in user"));
		}

		const existingOrErr = await this.getUser(uuid);
		if (existingOrErr.isLeft()) {
			return left(existingOrErr.value);
		}

		return this.nodeService.delete(uuid);
	}

	// Groups
	async createGroup(
		groupNode: Partial<GroupNode>,
	): Promise<Either<AntboxError, GroupNode>> {
		const group = nodeToGroup(groupNode as GroupNode);
		const trueOrErr = this.#groupSpec.isSatisfiedBy(group);

		if (trueOrErr.isLeft()) {
			return Promise.resolve(left(trueOrErr.value));
		}

		// deno-lint-ignore no-unused-vars
		const { uuid, ...rest } = groupNode;

		const nodeOrErr = await this.nodeService.create({ ...rest });

		return nodeOrErr as Either<AntboxError, GroupNode>;
	}

	async getGroup(uuid: string): Promise<Either<AntboxError, Group>> {
		if (uuid === Groups.ADMINS_GROUP_UUID) {
			return right(Admins);
		}

		const nodeOrErr = await this.nodeService.get(uuid);

		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}

		if (!nodeOrErr.value.isGroup()) {
			return left(new GroupNotFoundError(uuid));
		}

		return right(nodeToGroup(nodeOrErr.value));
	}

	async listGroups(): Promise<GroupNode[]> {
		const nodesOrErrs = await this.nodeService.find(
			[["mimetype", "==", Nodes.GROUP_MIMETYPE], ["parent", "==", Nodes.GROUPS_FOLDER_UUID]],
			Number.MAX_SAFE_INTEGER,
		);
		if (nodesOrErrs.isLeft()) {
			console.error(nodesOrErrs.value);
			return [];
		}

		const groups = nodesOrErrs.value.nodes as GroupNode[];
		const systemGroups = builtinGroups.map(groupToNode);

		return [
			...groups,
			...systemGroups,
		].sort((a, b) => a.title.localeCompare(b.title));
	}

	async updateGroup(uuid: string, data: Partial<Group>): Promise<Either<AntboxError, void>> {
		const fields = ["fid", "title", "description"];

		const existingOrErr = await this.getGroup(uuid);
		if (existingOrErr.isLeft()) {
			return left(existingOrErr.value);
		}

		const existing = existingOrErr.value;
		if (existing.builtIn) {
			return left(new BadRequestError("Cannot update built-in group"));
		}

		const group: Record<string, unknown> = {};
		Object.entries(data).forEach((entry) => {
			if (fields.includes(entry[0])) group[entry[0]] = entry[1];
		});

		const merged = Object.assign(existing, group);

		const trueOrErr = this.#groupSpec.isSatisfiedBy(merged);
		if (trueOrErr.isLeft()) {
			return Promise.resolve(left(trueOrErr.value));
		}

		return this.nodeService.update(uuid, group);
	}

	deleteGroup(uuid: string): Promise<Either<AntboxError, void>> {
		if (uuid === Groups.ADMINS_GROUP_UUID) {
			return Promise.resolve(left(new BadRequestError("Cannot delete admins group")));
		}
		return this.nodeService.delete(uuid);
	}
}
