import { Folders } from "domain/nodes/folders.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { GroupNode } from "domain/users_groups/group_node.ts";
import GroupNotFoundError from "domain/users_groups/group_not_found_error.ts";
import { Groups } from "domain/users_groups/groups.ts";
import { UserExistsError } from "domain/users_groups/user_exists_error.ts";
import { UserNode } from "domain/users_groups/user_node.ts";
import { UserNotFoundError } from "domain/users_groups/user_not_found_error.ts";
import { Users } from "domain/users_groups/users.ts";
import { AntboxError, BadRequestError, ForbiddenError } from "shared/antbox_error.ts";
import { left, right, type Either } from "shared/either.ts";
import { ValidationError } from "shared/validation_error.ts";
import type { AuthenticationContext } from "./authentication_context.ts";
import { ADMINS_GROUP, builtinGroups } from "./builtin_groups/index.ts";
import { ANONYMOUS_USER, builtinUsers, ROOT_USER } from "./builtin_users/index.ts";
import { InvalidCredentialsError } from "./invalid_credentials_error.ts";
import { nodeToGroup, nodeToUser, userToNode, type GroupDTO, type UserDTO } from "./users_groups_dto.ts";
import type { UsersGroupsContext } from "./users_groups_service_context.ts";

export class UsersGroupsService {

  constructor(private readonly context: UsersGroupsContext) {}

  async createUser(
    ctx: AuthenticationContext, 
    metadata: Partial<UserDTO>,
  ): Promise<Either<AntboxError, UserDTO>> {
    const existingOrErr = await this.getUser(ctx, metadata.email!);
    if(existingOrErr.isRight()) {
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

    return right(nodeToUser(user));
  }

  async getUser(
    ctx: AuthenticationContext, 
    email: string,
  ):  Promise<Either<AntboxError, UserDTO>> {
    if (email === Users.ROOT_USER_EMAIL) {
      return await this.#hasAdminGroup(ctx) 
        ? right(nodeToUser(ROOT_USER))
        : left(new ForbiddenError());
    }

    if (email === Users.ANONYMOUS_USER_EMAIL) {
      return right(nodeToUser(ANONYMOUS_USER));
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
      return right(nodeToUser(node));
    }
    
    return await this.#hasAdminGroup(ctx) 
      ? right(nodeToUser(node))
      : left(new ForbiddenError());
  }

  async getUserByCredentials(
    email: string, 
    password: string,
  ): Promise<Either<AntboxError, UserDTO>>{
    const hash = await UserNode.shaSum(email, password);

    const result = await this.context.repository.filter([
      ["secret", "==", hash],
    ]);

    if(result.nodes.length === 0) {
      return left(new InvalidCredentialsError());
    }

    return right(nodeToUser(result.nodes[0]));
  }

  async updateUser(
    ctx: AuthenticationContext, 
    email: string, 
    metadata: Partial<UserDTO>,
  ): Promise<Either<AntboxError, void>> {
    if (email === Users.ROOT_USER_EMAIL || email === Users.ANONYMOUS_USER_EMAIL) {
      return left(new BadRequestError("Cannot update built-in user"));
    }

    const existingOrErr = await this.getUser(ctx, email);
    if(existingOrErr.isLeft()) {
      return left(existingOrErr.value);
    }
    
    const user = userToNode(ctx, existingOrErr.value);

    const updateResultOrErr = user.update(metadata);
    if(updateResultOrErr.isLeft()) {
      return left(updateResultOrErr.value);
    }

    const voidOrErr = await this.context.repository.update(user);
    if(voidOrErr.isLeft()) {
      return left(voidOrErr.value);
    }

    return right(voidOrErr.value);
  }

  async deleteUser(
    uuid: string,
  ): Promise<Either<AntboxError, void>> {
    if (uuid === Users.ROOT_USER_UUID || uuid === Users.ANONYMOUS_USER_UUID) {
      return left(new BadRequestError("Cannot delete built-in user"));
    }

    const existingOrErr =  await this.context.repository.getById(uuid);
    if(existingOrErr.isLeft()) {
      return left(new UserNotFoundError(uuid));
    }

    const voidOrErr = await this.context.repository.delete(uuid);
    if(voidOrErr.isLeft()) {
      return left(voidOrErr.value);
    }

    return right(voidOrErr.value);
  }

  async listUsers(): Promise<Either<ForbiddenError, UserDTO[]>> {
    const usersOrErr = await this.context.repository.filter([
      ["mimetype", "==", Nodes.USER_MIMETYPE],
      ["parent", "==", Folders.USERS_FOLDER_UUID]
    ], Number.MAX_SAFE_INTEGER);

    const users = usersOrErr.nodes.map(nodeToUser);
    const sytemUsers = builtinUsers.map(nodeToUser);

    return right([...users, ...sytemUsers].sort((a, b) => a.name.localeCompare(b.name)));
  }

  async #hasAdminGroup(ctx: AuthenticationContext): Promise<boolean> {
    return ctx.principal.groups.includes(Groups.ADMINS_GROUP_UUID);
  }

  async changePassword(
    ctx: AuthenticationContext, 
    email: string, 
    password: string,
  ): Promise<Either<AntboxError, void>> {
    const existingOrErr = await this.getUser(ctx, email);
    if(existingOrErr.isLeft()) {
      return left(existingOrErr.value);
    }

    const user = userToNode(ctx, existingOrErr.value);

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

  async createGroup(
    ctx: AuthenticationContext, 
    metadata: GroupDTO): Promise<Either<AntboxError, GroupDTO>> {
    const groupOrErr = GroupNode.create({ 
      ...metadata, 
      owner: ctx.principal.email 
    });

    if(groupOrErr.isLeft()) {
      return left(groupOrErr.value);
    }

    const group = groupOrErr.value;

    const voidOrErr = await this.context.repository.add(group);
    if(voidOrErr.isLeft()) {
      return left(voidOrErr.value);
    }

    return right(nodeToGroup(group));
  }

  async getGroup(uuid: string): Promise<Either<AntboxError, GroupNode>> {
    if (uuid === Groups.ADMINS_GROUP_UUID) {
      return right(ADMINS_GROUP);
    }

    const groupOrErr = await this.context.repository.getById(uuid);

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

  async listGroups(): Promise<GroupDTO[]> {
    const groupsOrErr = await this.context.repository.filter(
      [
        ["mimetype", "==", Nodes.GROUP_MIMETYPE],
        ["parent", "==", Folders.GROUPS_FOLDER_UUID]
      ],
      Number.MAX_SAFE_INTEGER
    );

    const groups = groupsOrErr.nodes.map(nodeToGroup);
    const systemGroups = builtinGroups.map(nodeToGroup);

    return [...groups, ...systemGroups].sort((a, b) => a.title.localeCompare(b.title));
  }
}
