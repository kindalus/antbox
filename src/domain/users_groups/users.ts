import { Groups } from "./groups.ts";
import { UserNode } from "./user_node.ts";

export class Users {
	static ANONYMOUS_USER_UUID = "--anonymous--";
	static ANONYMOUS_USER_EMAIL = "anonymous@antbox.io";
	static ROOT_USER_UUID = "--root--";
	static ROOT_USER_EMAIL = "root@antbox.io";

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
}
