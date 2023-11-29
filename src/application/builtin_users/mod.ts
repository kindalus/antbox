import { UserNode } from "../../domain/nodes/user_node.ts";
import { Anonymous } from "./anonymous.ts";
import { Root } from "./root.ts";

export const builtinUsers: UserNode[] = [Root, Anonymous];
