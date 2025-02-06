import { Groups } from "../../domain/auth/groups.ts";
import { UserNode } from "../../domain/auth/user_node.ts";
import { Users } from "../../domain/auth/users.ts";

export const Anonymous = UserNode.create({
	uuid: Users.ANONYMOUS_USER_UUID,
	email: Users.ANONYMOUS_USER_EMAIL,
	title: "anonymous",
	group: Groups.ANONYMOUS_GROUP_UUID,
	groups: [Groups.ANONYMOUS_GROUP_UUID],
}).right;
