import { GroupData } from "domain/configuration/group_data.ts";
import { Groups } from "domain/users_groups/groups.ts";
import { Users } from "domain/users_groups/users.ts";

export const ADMINS_GROUP: GroupData = {
	uuid: Groups.ADMINS_GROUP_UUID,
	title: "Admins",
	description: "Admins",
	createdTime: new Date().toISOString(),
};

export const ANONYMOUS_GROUP: GroupData = {
	uuid: Groups.ANONYMOUS_GROUP_UUID,
	title: "Anonymous",
	description: "Anonymous",
	createdTime: new Date().toISOString(),
};

export const builtinGroups: GroupData[] = [ADMINS_GROUP, ANONYMOUS_GROUP];
