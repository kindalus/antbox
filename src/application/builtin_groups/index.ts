import { GroupNode } from "domain/auth/group_node.ts";
import { Groups } from "domain/auth/groups.ts";
import { Users } from "domain/auth/users";

export const ADMINS_GROUP: GroupNode = GroupNode.create({
  uuid: Groups.ADMINS_GROUP_UUID,
  fid: Groups.ADMINS_GROUP_UUID,
  title: "Admins",
  description: "Admins",
  owner: Users.ROOT_USER_EMAIL,
  group: Groups.ADMINS_GROUP_UUID,
}).right;

export const builtinGroups: GroupNode[] = [ADMINS_GROUP];
