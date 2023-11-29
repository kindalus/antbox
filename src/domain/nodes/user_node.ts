import { Group } from "../auth/group.ts";
import { Node } from "./node.ts";

export class UserNode extends Node {
	static ANONYMOUS_USER_UUID = "--anonymous--";
	static ANONYMOUS_USER_EMAIL = "anonymous@antbox.io";
	static ROOT_USER_UUID = "--root--";
	static ROOT_USER_EMAIL = "root@antbox.io";

	static isRoot(user: UserNode): boolean {
		return user.uuid === UserNode.ROOT_USER_UUID;
	}

	static isAdmin(user: UserNode): boolean {
		return user.group === Group.ADMINS_GROUP_UUID ||
			user.groups.includes(Group.ADMINS_GROUP_UUID);
	}

	static isAnonymous(user: UserNode): boolean {
		return user.uuid === UserNode.ANONYMOUS_USER_UUID;
	}

	readonly email: string;
	readonly group: string;
	readonly groups: string[];

	constructor() {
		super();
		this.mimetype = Node.USER_MIMETYPE;
		this.parent = Node.USERS_FOLDER_UUID;
		this.size = 0;
		this.group = "";
		this.groups = [];
		this.email = "";
	}

	isAdmin(): boolean {
		return UserNode.isAdmin(this);
	}

	isAnonymous(): boolean {
		return UserNode.isAnonymous(this);
	}

	isRoot(): boolean {
		return UserNode.isRoot(this);
	}
}
