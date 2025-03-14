import { GroupNode } from "domain/users_groups/group_node";
import { Groups } from "domain/users_groups/groups";
import { Users } from "domain/users_groups/users";

export const ADMINS_GROUP: GroupNode = GroupNode.create({
  uuid: Groups.ADMINS_GROUP_UUID,
  fid: Groups.ADMINS_GROUP_UUID,
  title: "Admins",
  description: "Admins",
  owner: Users.ROOT_USER_EMAIL,
  group: Groups.ADMINS_GROUP_UUID,
}).right;

export const builtinGroups: GroupNode[] = [ADMINS_GROUP];
