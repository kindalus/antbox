import { Action } from "/domain/actions/action.ts";
import moveUp from "./move_up.ts";
import delete_all from "./delete_all.ts";
import move_to_folder from "./move_to_folder.ts";
import copy_to_folder from "./copy_to_folder.ts";

export const builtinActions: Action[] = [
	copy_to_folder,
	move_to_folder,
	delete_all,
	moveUp,
];
