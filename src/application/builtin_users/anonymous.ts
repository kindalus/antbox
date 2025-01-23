import { Users } from "../../domain/auth/users.ts";

export const Anonymous = Users.create({
	uuid: Users.ANONYMOUS_USER_UUID,
	email: Users.ANONYMOUS_USER_EMAIL,
	title: "anonymous",
	group: Groups.ANONYMOUS_GROUP_UUID,
	groups: [Groups.ANONYMOUS_GROUP_UUID],
});
