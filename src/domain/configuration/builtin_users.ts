import type { UserData } from "./user_data.ts";
import { ADMINS_GROUP_UUID, ANONYMOUS_GROUP_UUID } from "./builtin_groups.ts";

/**
 * Builtin system users
 * These are hardcoded and always available in the system
 */

export const ROOT_USER_EMAIL = "root@antbox.io";
export const ANONYMOUS_USER_EMAIL = "anonymous@antbox.io";
export const LOCK_SYSTEM_USER_EMAIL = "lock-system@antbox.io";
export const WORKFLOW_INSTANCE_USER_EMAIL = "workflow-instance@antbox.io";

const BASE_TIME = "2024-01-01T00:00:00.000Z";

export const ROOT_USER: UserData = {
	email: ROOT_USER_EMAIL,
	title: "root",
	group: ADMINS_GROUP_UUID,
	groups: [ADMINS_GROUP_UUID],
	hasWhatsapp: false,
	active: true,
	createdTime: BASE_TIME,
	modifiedTime: BASE_TIME,
};

export const ANONYMOUS_USER: UserData = {
	email: ANONYMOUS_USER_EMAIL,
	title: "anonymous",
	group: ANONYMOUS_GROUP_UUID,
	groups: [ANONYMOUS_GROUP_UUID],
	hasWhatsapp: false,
	active: true,
	createdTime: BASE_TIME,
	modifiedTime: BASE_TIME,
};

export const LOCK_SYSTEM_USER: UserData = {
	email: LOCK_SYSTEM_USER_EMAIL,
	title: "Lock System",
	group: ADMINS_GROUP_UUID,
	groups: [ADMINS_GROUP_UUID],
	hasWhatsapp: false,
	active: true,
	createdTime: BASE_TIME,
	modifiedTime: BASE_TIME,
};

export const WORKFLOW_INSTANCE_USER: UserData = {
	email: WORKFLOW_INSTANCE_USER_EMAIL,
	title: "Workflow Instance",
	group: ADMINS_GROUP_UUID,
	groups: [ADMINS_GROUP_UUID],
	hasWhatsapp: false,
	active: true,
	createdTime: BASE_TIME,
	modifiedTime: BASE_TIME,
};

export const BUILTIN_USERS: readonly UserData[] = [
	ROOT_USER,
	ANONYMOUS_USER,
	LOCK_SYSTEM_USER,
	WORKFLOW_INSTANCE_USER,
];
