import { Node } from "./node.ts";

export class UserNode extends Node {
	email: string;
	group: string;
	groups: string[];
	constructor() {
		super();
		this.mimetype = Node.USER_MIMETYPE;
		this.parent = Node.USERS_FOLDER_UUID;
		this.size = 0;
		this.group = "";
		this.groups = [];
		this.email = "";
	}
}
