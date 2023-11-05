import { Group } from "./group.ts";

export class User {
	static ANONYMOUS_USER_UUID = "--anonymous--";
	static ANONYMOUS_USER_EMAIL = "anonymous@antbox.io";
	static ROOT_USER_UUID = "--root--";
	static ROOT_USER_EMAIL = "root@antbox.io";

	static isRoot(user: User): boolean {
		return user.uuid === User.ROOT_USER_UUID;
	}

	static isAdmin(user: User): boolean {
		return user.group === Group.ADMINS_GROUP_UUID ||
			user.groups.includes(Group.ADMINS_GROUP_UUID);
	}

	static isAnonymous(user: User): boolean {
		return user.uuid === User.ANONYMOUS_USER_UUID;
	}

	static create(email: string, fullname: string): User {
		return new User(undefined, email, fullname);
	}

	static createWithGroup(email: string, fullname: string, group: string): User {
		return Object.assign(new User(), {
			email,
			fullname,
			group,
		});
	}

	constructor(
		readonly uuid?: string,
		readonly email?: string,
		readonly fullname?: string,
		readonly group?: string,
		readonly groups: string[] = [],
		readonly builtIn = false,
	) {
	}

	isAdmin(): boolean {
		return User.isAdmin(this);
	}

	isAnonymous(): boolean {
		return User.isAnonymous(this);
	}

	isRoot(): boolean {
		return User.isRoot(this);
	}
}
