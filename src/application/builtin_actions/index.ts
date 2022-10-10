import { Action } from "/domain/actions/action.ts";
import moveUp from "./move_up.ts";
import move_to_trash from "./move_to_trash.ts";
import move_to_folder from "./move_to_folder.ts";
import copy_to_folder from "./copy_to_folder.ts";

export const builtinActions: Action[] = [
  copy_to_folder,
  move_to_folder,
  move_to_trash,
  moveUp,
];
