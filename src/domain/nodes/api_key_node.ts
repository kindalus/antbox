import { Node } from "./node.ts";

export class ApiKeyNode extends Node {
	group: string;
	secret: string;
	constructor(group = "", secret = "") {
		super();

		this.mimetype = Node.API_KEY_MIMETYPE;
		this.parent = Node.API_KEYS_FOLDER_UUID;
		this.group = group;
		this.secret = secret;
		this.title = secret.replace(/^(\w{4}).*$/g, "$1******");
	}

	cloneWithSecret(): ApiKeyNode {
		return Object.assign(new ApiKeyNode(), this, { secret: "*** secret ***" });
	}
}
