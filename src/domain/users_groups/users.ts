import { Groups } from "./groups.ts";
import { UserData } from "domain/configuration/user_data.ts";

export class Users {
	static ANONYMOUS_USER_UUID = "--anonymous--";
	static ANONYMOUS_USER_EMAIL = "anonymous@antbox.io";
	static API_KEY_USER_UUID = "--api-key--";
	static API_KEY_USER_EMAIL = "apikey@antbox.io";
	static ROOT_USER_UUID = "--root--";
	static ROOT_USER_EMAIL = "root@antbox.io";
	static LOCK_SYSTEM_USER_UUID = "--lock-system--";
	static LOCK_SYSTEM_USER_EMAIL = "lock-system@antbox.io";
	static WORKFLOW_INSTANCE_USER_UUID = "--workflow-instance--";
	static WORKFLOW_INSTANCE_USER_EMAIL = "workflow-instance@antbox.io";

	static isRoot(user: UserData): boolean {
		return user.email === Users.ROOT_USER_EMAIL;
	}

	static isAdmin(user: UserData): boolean {
		return user.groups.includes(Groups.ADMINS_GROUP_UUID);
	}

	static isAnonymous(user: UserData): boolean {
		return user.email === Users.ANONYMOUS_USER_EMAIL;
	}

	static isLockSystem(user: UserData): boolean {
		return user.email === Users.LOCK_SYSTEM_USER_EMAIL;
	}

	static isWorkflowInstance(user: UserData): boolean {
		return user.email === Users.WORKFLOW_INSTANCE_USER_EMAIL;
	}
}
