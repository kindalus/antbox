import { Groups } from "./groups.ts";
import { UserNode } from "./user_node.ts";

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

	static isRoot(user: UserNode): boolean {
		return user.uuid === Users.ROOT_USER_UUID;
	}

	static isAdmin(user: UserNode): boolean {
		return user.group === Groups.ADMINS_GROUP_UUID ||
			user.groups.includes(Groups.ADMINS_GROUP_UUID);
	}

	static isAnonymous(user: UserNode): boolean {
		return user.uuid === Users.ANONYMOUS_USER_UUID;
	}

	static isLockSystem(user: UserNode): boolean {
		return user.uuid === Users.LOCK_SYSTEM_USER_UUID;
	}

	static isWorkflowInstance(user: UserNode): boolean {
		return user.uuid === Users.WORKFLOW_INSTANCE_USER_UUID;
	}
}
