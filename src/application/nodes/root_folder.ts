import { FolderNode } from "domain/nodes/folder_node.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { Groups } from "domain/users_groups/groups.ts";
import { Users } from "domain/users_groups/users.ts";

export function createRootFolder(): FolderNode {
	return FolderNode.create({
		uuid: Nodes.ROOT_FOLDER_UUID,
		fid: Nodes.ROOT_FOLDER_UUID,
		title: "Root",
		parent: Nodes.ROOT_FOLDER_UUID,
		owner: Users.ROOT_USER_EMAIL,
		group: Groups.ADMINS_GROUP_UUID,
		filters: [["mimetype", "in", [
			Nodes.FOLDER_MIMETYPE,
			Nodes.SMART_FOLDER_MIMETYPE,
		]]],
		permissions: {
			group: ["Read", "Write", "Export"],
			authenticated: ["Read"],
			anonymous: [],
			advanced: {},
		},
	}).right;
}
