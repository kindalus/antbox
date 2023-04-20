import { Node } from "/domain/nodes/node.ts";
import { Aspect } from "/domain/aspects/aspect.ts";

export const GroupAspect = {
	uuid: "group",
	title: "Grupo",
	builtIn: true,
	description: "Representa um grupo",
	filters: [
		["mimetype", "==", "application/vnd.antbox.metanode"],
		["parent", "==", [Node.GROUPS_FOLDER_UUID]],
	],
} as Aspect;
