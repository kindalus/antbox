import { Node } from "./node.ts";

export class GroupNode extends Node {
	description: string;
	constructor() {
		super();
		this.mimetype = Node.GROUP_MIMETYPE;
		this.parent = Node.GROUPS_FOLDER_UUID;
		this.size = 0;
		this.description = "";
	}
}
