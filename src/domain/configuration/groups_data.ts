/**
 * Re-export Groups constants for backward compatibility
 * This maintains the same API as the old Groups class
 */
export { ADMINS_GROUP_UUID, ANONYMOUS_GROUP_UUID } from "./builtin_groups.ts";

export class Groups {
	static readonly ADMINS_GROUP_UUID = "--admins--";
	static readonly ANONYMOUS_GROUP_UUID = "--anonymous--";
}
