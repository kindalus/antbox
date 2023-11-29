import { Group } from "../../domain/auth/group.ts";
import { UserNode } from "../../domain/nodes/user_node.ts";
import { UserNodeBuilder } from "../../domain/nodes/user_node_builder.ts";

export const Root: UserNode = new UserNodeBuilder()
	.withUuid(UserNode.ROOT_USER_UUID)
	.withEmail(UserNode.ROOT_USER_EMAIL)
	.withTitle("root")
	.withGroup(Group.ADMINS_GROUP_UUID)
	.withGroups([Group.ADMINS_GROUP_UUID])
	.build().value as UserNode;
