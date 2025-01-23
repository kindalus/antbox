import move_up from "./move_up.ts";
import delete_all from "./delete_all.ts";
import { Action } from "../../domain/actions/action.ts";
import copy_to_folder from "./copy_to_folder.ts";
import move_to_folder from "./move_to_folder.ts";

export const builtinActions: Action[] = [
  copy_to_folder,
  move_to_folder,
  delete_all,
  move_up,
];
