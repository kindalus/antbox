import { Group } from "../../domain/auth/group.ts";
import { Groups } from "../../domain/auth/groups.ts";

export const Admins: Group = Object.assign(new Group(), {
	uuid: Groups.ADMINS_GROUP_UUID,
	fid: Groups.ADMINS_GROUP_UUID,
	title: "Admins",
	description: "Admins",
	builtIn: true,
});
