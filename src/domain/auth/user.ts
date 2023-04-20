import { Group } from "./group.ts";

export class User {
	static ANONYMOUS_USER_UUID = "--anonymous--";
	static ANONYMOUS_USER_EMAIL = "anonymous@antbox.io";
	static ROOT_USER_UUID = "--root--";
	static ROOT_USER_EMAIL = "root@antbox.io";

	static isAdmin(user: User): boolean {
		return user.groups.includes(Group.ADMINS_GROUP_UUID);
	}

	static isAnonymous(user: User): boolean {
		return user.uuid === User.ANONYMOUS_USER_UUID;
	}

	static create(email: string, fullname: string): User {
		return Object.assign(new User(), {
			email,
			fullname,
		});
	}

	constructor() {}

	readonly uuid: string = null as unknown as string;
	readonly email: string = null as unknown as string;
	readonly fullname: string = null as unknown as string;
	readonly group: string = null as unknown as string;
	readonly groups: string[] = [];
	readonly builtIn: boolean = false;

	isAdmin(): boolean {
		return User.isAdmin(this);
	}

	isAnonymous(): boolean {
		return User.isAnonymous(this);
	}
}
