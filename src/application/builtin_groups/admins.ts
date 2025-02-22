import { GroupNode } from "domain/auth/group_node.ts";
import { Groups } from "domain/auth/groups.ts";

export const Admins: GroupNode = GroupNode.create({
  uuid: Groups.ADMINS_GROUP_UUID,
  fid: Groups.ADMINS_GROUP_UUID,
  title: "Admins",
  description: "Admins",
}).right;
