import { User } from "/domain/auth/user.ts";
import { Anonymous } from "./anonymous.ts";
import { Root } from "./root.ts";

export const builtinUsers: User[] = [
	Root,
	Anonymous,
];
