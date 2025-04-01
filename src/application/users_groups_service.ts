import { UserNode } from "domain/users_groups/user_node.ts";
import { AntboxError, BadRequestError, ForbiddenError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import type { UsersGroupsContext } from "./users_groups_service_context.ts";
import { UserExistsError } from "domain/users_groups/user_exists_error.ts";
import { ValidationError } from "shared/validation_error.ts";
import GroupNotFoundError from "domain/users_groups/group_not_found_error.ts";
import { GroupNode } from "domain/users_groups/group_node.ts";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { UserNotFoundError } from "domain/users_groups/user_not_found_error.ts";
import { Users } from "domain/users_groups/users.ts";
import { ANONYMOUS_USER, builtinUsers, ROOT_USER } from "./builtin_users/index.ts";
import type { AuthenticationContext } from "./authentication_context.ts";
import { Groups } from "domain/users_groups/groups.ts";
import { InvalidCredentialsError } from "./invalid_credentials_error.ts";
import { ADMINS_GROUP, builtinGroups } from "./builtin_groups/index.ts";
import { Folders } from "domain/nodes/folders.ts";

export class UsersGroupsService {

  constructor(private readonly context: UsersGroupsContext) {}

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

  async createUser(ctx: AuthenticationContext, metadata: Partial<UserNode>): Promise<Either<AntboxError, UserNode>> {
    const existingOrErr = await this.getUserByEmail(ctx, metadata.email!);
    if(existingOrErr.isRight()) {
      return left(ValidationError.from(new UserExistsError(metadata.uuid!)));
    }

    const groups = new Set(metadata.groups ?? []);

    const userOrErr = UserNode.create({
      ...metadata,
      group: Array.from(groups)[0],
      groups: Array.from(groups).slice(1),
    });
    
    if(userOrErr.isLeft()) {
      return left(userOrErr.value);
    }

    if(groups.size > 0) {
      const batch = metadata.groups?.map((group) => this.getGroup(group));

      const groupsOrErr = await Promise.all(batch!);

      const groupsErr = groupsOrErr.filter((groupOrErr) => groupOrErr.isLeft());

      if(groupsErr.length > 0) {
        const errs = groupsErr.map((groupOrErr) => groupOrErr.value);
        return left(ValidationError.from(...errs));
      }
    }

    const user = userOrErr.value;

    const voidOrErr = await this.context.repository.add(user);
    if(voidOrErr.isLeft()) {
      return left(voidOrErr.value);
    }

    return right(user);
  }

  async getUser(ctx: AuthenticationContext, uuid: string): Promise<Either<AntboxError, UserNode>> {
    if(uuid === Users.ROOT_USER_UUID) {
      return  await this.#hasAdminGroup(ctx) ? right(ROOT_USER) : left(new ForbiddenError());
    }

    if(uuid === Users.ANONYMOUS_USER_UUID) {
      return right(ANONYMOUS_USER);
    }

    const userOrErr = await this.#getUserFromRepository(uuid);
    if(userOrErr.isLeft()) {
      return left(new UserNotFoundError(uuid));
    }

    const user = userOrErr.value;

    if(!Nodes.isUser(user)) {
      return left(new UserNotFoundError(uuid));
    }

    if(user.email == ctx.principal.email) {
      return right(user);
    }

    return ctx.principal.groups.includes(Groups.ADMINS_GROUP_UUID) 
      ? right(user) 
      : left(new ForbiddenError());
  }

  async getUserByEmail(ctx: AuthenticationContext, email: string):  Promise<Either<AntboxError, UserNode>> {
    if (email === Users.ROOT_USER_EMAIL) {
      return ctx.principal.groups.includes(Groups.ADMINS_GROUP_UUID)
        ? right(ROOT_USER)
        : left(new ForbiddenError());
    }

    if (email === Users.ANONYMOUS_USER_EMAIL) {
      return right(ANONYMOUS_USER);
    }
  
    const result = await this.context.repository.filter([
      ["email", "==", email],
      ["mimetype", "==", Nodes.USER_MIMETYPE],
    ]);

    if(result.nodes.length === 0) {
      return left(new UserNotFoundError(email));
    }

    const node = result.nodes[0];

    if (node.email === ctx.principal.email) {
      return right(node);
    }
    
    return ctx.principal.groups.includes(Groups.ADMINS_GROUP_UUID)
      ? right(node)
      : left(new ForbiddenError());
  }

  async getUserByCredentials(email: string, password: string): Promise<Either<AntboxError, UserNode>>{
    const hash = await UserNode.shaSum(email, password);

    const result = await this.context.repository.filter([
      ["secret", "==", hash],
    ]);

    if(result.nodes.length === 0) {
      return left(new InvalidCredentialsError());
    }

    return right(result.nodes[0]);
  }

  async updateUser(
    ctx: AuthenticationContext, 
    uuid: string, 
    data: Partial<UserNode>): Promise<Either<AntboxError, void>> {
      if (uuid === Users.ROOT_USER_UUID || uuid === Users.ANONYMOUS_USER_UUID) {
        return left(new BadRequestError("Cannot update built-in user"));
      }

      const existingOrErr = await this.getUser(ctx, uuid);
      if(existingOrErr.isLeft()) {
        return left(existingOrErr.value);
      }
      
      const user = existingOrErr.value;

      const updateResultOrErr = user.update(data);
      if(updateResultOrErr.isLeft()) {
        return left(updateResultOrErr.value);
      }

      const voidOrErr = await this.context.repository.update(user);
      if(voidOrErr.isLeft()) {
        return left(voidOrErr.value);
      }

      return right(voidOrErr.value);
  }

  async deleteUser(ctx: AuthenticationContext, uuid: string): Promise<Either<AntboxError, void>> {
    if (uuid === Users.ROOT_USER_UUID || uuid === Users.ANONYMOUS_USER_UUID) {
      return left(new BadRequestError("Cannot delete built-in user"));
    }

    const existingOrErr =  await  this.getUser(ctx, uuid);
    if(existingOrErr.isLeft()) {
      return left(existingOrErr.value);
    }

    const voidOrErr = await this.context.repository.delete(uuid);
    if(voidOrErr.isLeft()) {
      return left(voidOrErr.value);
    }

    return right(voidOrErr.value);
  }

  async listUsers(): Promise<Either<ForbiddenError, UserNode[]>> {
    const usersOrErr = await this.context.repository.filter([
      ["mimetype", "==", Nodes.USER_MIMETYPE],
      ["parent", "==", Folders.USERS_FOLDER_UUID]
    ], Number.MAX_SAFE_INTEGER);

    const users = usersOrErr.nodes as UserNode[];
    const sytemUsers = builtinUsers;

    return right([...users, ...sytemUsers].sort((a, b) => a.title.localeCompare(b.title)));
  }

  async #hasAdminGroup(ctx: AuthenticationContext): Promise<boolean> {
    return ctx.principal.groups.includes(Groups.ADMINS_GROUP_UUID);
  }

  async #getUserFromRepository(uuid: string): Promise<Either<NodeNotFoundError, UserNode>> {
    if(Nodes.isFid(uuid)) {
      return this.context.repository.getByFid(Nodes.uuidToFid(uuid));
    }

    return this.context.repository.getById(uuid);
  }

  async changePassword(ctx: AuthenticationContext, uuid: string, password: string): Promise<Either<AntboxError, void>> {
    const existingOrErr = await this.getUser(ctx, uuid);
    if(existingOrErr.isLeft()) {
      return left(existingOrErr.value);
    }

    const user = existingOrErr.value;

    const updateResult = user.update({ secret: password });
    if(updateResult.isLeft()) {
      return left(updateResult.value);
    }

    const voidOrErr = await this.context.repository.update(user);
    if(voidOrErr.isLeft()) {
      return left(voidOrErr.value);
    }

    return right(voidOrErr.value);
  }

  async createGroup(groupNode: Partial<GroupNode>): Promise<Either<AntboxError, GroupNode>> {
    const groupOrErr = GroupNode.create(groupNode);
    if(groupOrErr.isLeft()) {
      return left(groupOrErr.value);
    }

    const group = groupOrErr.value;

    const voidOrErr = await this.context.repository.add(group);
    if(voidOrErr.isLeft()) {
      return left(voidOrErr.value);
    }

    return right(group);
  }

  async getGroup(uuid: string): Promise<Either<AntboxError, GroupNode>> {
    if (uuid === Groups.ADMINS_GROUP_UUID) {
      return right(ADMINS_GROUP);
    }

    const groupOrErr = await this.#getGroupFromRepository(uuid);

    if(groupOrErr.isLeft()) {
      return left(groupOrErr.value);
    }

    const group = groupOrErr.value;

    if(!Nodes.isGroup(group)) {
      return left(new GroupNotFoundError(uuid));
    }

    return right(group);
  }

  async updateGroup(uuid: string, data: Partial<GroupNode>): Promise<Either<AntboxError, void>> {
    if (builtinGroups.find((group) => group.uuid === uuid)) {
      return left(new BadRequestError("Cannot update built-in group"));
    }

    const existingOrErr = await this.getGroup(uuid);
    if(existingOrErr.isLeft()) {
      return left(existingOrErr.value);
    }

    const group = existingOrErr.value;

    const updateResultOrErr = group.update(data);
    if(updateResultOrErr.isLeft()) {
      return left(updateResultOrErr.value);
    }

    const voidOrErr = await this.context.repository.update(group);
    if(voidOrErr.isLeft()) {
      return left(voidOrErr.value);
    }

    return right(voidOrErr.value);
  }

  async deleteGroup(uuid: string): Promise<Either<AntboxError, void>> {
    if (uuid === Groups.ADMINS_GROUP_UUID) {
      return left(new BadRequestError("Cannot delete admins group"));
    }

    const existingOrErr = await this.getGroup(uuid);
    if(existingOrErr.isLeft()) {
      return left(existingOrErr.value);
    }

    const voidOrErr = await this.context.repository.delete(uuid);
    if(voidOrErr.isLeft()) {
      return left(voidOrErr.value);
    }

    return right(voidOrErr.value);
  }

  async #getGroupFromRepository(uuid: string): Promise<Either<NodeNotFoundError, GroupNode>> {
    if(Nodes.isFid(uuid)) {
      return this.context.repository.getByFid(Nodes.uuidToFid(uuid));
    }

    return this.context.repository.getById(uuid);
  }

  async listGroups(): Promise<GroupNode[]> {
    const groupsOrErr = await this.context.repository.filter(
      [
        ["mimetype", "==", Nodes.GROUP_MIMETYPE],
        ["parent", "==", Folders.GROUPS_FOLDER_UUID]
      ],
      Number.MAX_SAFE_INTEGER
    );

    const groups = groupsOrErr.nodes as GroupNode[];
    const systemGroups = builtinGroups;

    return [...groups, ...systemGroups].sort((a, b) => a.title.localeCompare(b.title));
  }
}
