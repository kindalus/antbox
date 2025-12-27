import type { GroupData } from "./group_data.ts";

/**
 * Builtin system groups
 * These are hardcoded and always available in the system
 */

export const ADMINS_GROUP_UUID = "--admins--";
export const ANONYMOUS_GROUP_UUID = "--anonymous--";

const BASE_TIME = "2024-01-01T00:00:00.000Z";

export const ADMINS_GROUP: GroupData = {
	uuid: ADMINS_GROUP_UUID,
	title: "Admins",
	description: "System administrators with full access",
	createdTime: BASE_TIME,
};

export const ANONYMOUS_GROUP: GroupData = {
	uuid: ANONYMOUS_GROUP_UUID,
	title: "Anonymous",
	description: "Unauthenticated users",
	createdTime: BASE_TIME,
};

export const BUILTIN_GROUPS: readonly GroupData[] = [
	ADMINS_GROUP,
	ANONYMOUS_GROUP,
];
