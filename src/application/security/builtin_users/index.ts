import { Groups } from "domain/users_groups/groups.ts";
import { UserData } from "domain/configuration/user_data.ts";
import { Users } from "domain/users_groups/users.ts";

export const ANONYMOUS_USER: UserData = {
	email: Users.ANONYMOUS_USER_EMAIL,
	title: "anonymous",
	group: Groups.ANONYMOUS_GROUP_UUID,
	groups: [Groups.ANONYMOUS_GROUP_UUID],
	hasWhatsapp: false,
	active: true,
	createdTime: new Date().toISOString(),
	modifiedTime: new Date().toISOString(),
};

export const ROOT_USER: UserData = {
	email: Users.ROOT_USER_EMAIL,
	title: "root",
	group: Groups.ADMINS_GROUP_UUID,
	groups: [Groups.ADMINS_GROUP_UUID],
	hasWhatsapp: false,
	active: true,
	createdTime: new Date().toISOString(),
	modifiedTime: new Date().toISOString(),
};

export const LOCK_SYSTEM_USER: UserData = {
	email: Users.LOCK_SYSTEM_USER_EMAIL,
	title: "Lock System",
	group: Groups.ADMINS_GROUP_UUID,
	groups: [Groups.ADMINS_GROUP_UUID],
	hasWhatsapp: false,
	active: true,
	createdTime: new Date().toISOString(),
	modifiedTime: new Date().toISOString(),
};

export const WORKFLOW_INSTANCE_USER: UserData = {
	email: Users.WORKFLOW_INSTANCE_USER_EMAIL,
	title: "Workflow Instance",
	group: Groups.ADMINS_GROUP_UUID,
	groups: [Groups.ADMINS_GROUP_UUID],
	hasWhatsapp: false,
	active: true,
	createdTime: new Date().toISOString(),
	modifiedTime: new Date().toISOString(),
};

export const builtinUsers: UserData[] = [
	ROOT_USER,
	ANONYMOUS_USER,
	LOCK_SYSTEM_USER,
	WORKFLOW_INSTANCE_USER,
];
