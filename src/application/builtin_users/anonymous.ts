import { Group } from "../../domain/auth/group.ts";
import { UserNode } from "../../domain/nodes/user_node.ts";
import { UserNodeBuilder } from "../../domain/nodes/user_node_builder.ts";

export const Anonymous: UserNode = new UserNodeBuilder()
	.withUuid(UserNode.ANONYMOUS_USER_UUID)
	.withEmail(UserNode.ANONYMOUS_USER_EMAIL)
	.withTitle("anonymous")
	.withGroup(Group.ANONYMOUS_GROUP_UUID)
	.withGroups([Group.ANONYMOUS_GROUP_UUID])
	.build().value as UserNode;
