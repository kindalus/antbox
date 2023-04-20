import { User } from "/domain/auth/user.ts";

export const Anonymous: User = Object.assign(new User(), {
	uuid: User.ANONYMOUS_USER_UUID,
	email: User.ANONYMOUS_USER_EMAIL,
	fullname: "anonymous",
	builtIn: true,
});
