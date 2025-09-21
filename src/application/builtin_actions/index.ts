import move_up from "./move_up.ts";
import delete_all from "./delete_all.ts";
import copy_to_folder from "./copy_to_folder.ts";
import move_to_folder from "./move_to_folder.ts";
import { Feature } from "domain/features/feature.ts";

export const builtinActions: Feature[] = [
  copy_to_folder,
  move_to_folder,
  delete_all,
  move_up,
];
