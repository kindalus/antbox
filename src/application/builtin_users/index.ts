import { Groups } from "domain/auth/groups.ts";
import { UserNode } from "domain/auth/user_node.ts";
import { Users } from "domain/auth/users.ts";

export const ANONYMOUS_USER = UserNode.create({
  uuid: Users.ANONYMOUS_USER_UUID,
  email: Users.ANONYMOUS_USER_EMAIL,
  title: "anonymous",
  group: Groups.ANONYMOUS_GROUP_UUID,
  groups: [Groups.ANONYMOUS_GROUP_UUID],
}).right;

export const ROOT_USER = UserNode.create({
  uuid: Users.ROOT_USER_UUID,
  email: Users.ROOT_USER_EMAIL,
  title: "root",
  group: Groups.ADMINS_GROUP_UUID,
  groups: [Groups.ADMINS_GROUP_UUID],
}).value as UserNode;

export const builtinUsers: UserNode[] = [ROOT_USER, ANONYMOUS_USER];
