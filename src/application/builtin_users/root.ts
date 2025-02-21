import { Groups } from "../../domain/auth/groups.ts";
import { UserNode } from "../../domain/auth/user_node.ts";
import { Users } from "../../domain/auth/users.ts";

export const Root = UserNode.create({
	uuid: Users.ROOT_USER_UUID,
	email: Users.ROOT_USER_EMAIL,
	title: "root",
	group: Groups.ADMINS_GROUP_UUID,
	groups: [Groups.ADMINS_GROUP_UUID],
}).value as UserNode;
