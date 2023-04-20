import { Admins } from "./admins.ts";
import { Group } from "/domain/auth/group.ts";

export const builtinGroups: Group[] = [
	Admins,
];
