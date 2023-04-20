import { Group } from "../../domain/auth/group.ts";
import { User } from "/domain/auth/user.ts";

export const Root: User = Object.assign(new User(), {
	uuid: User.ROOT_USER_UUID,
	email: User.ROOT_USER_EMAIL,
	fullname: "root",
	group: Group.ADMINS_GROUP_UUID,
	groups: [Group.ADMINS_GROUP_UUID],
	builtIn: true,
});
