import { ValidationError } from "https://deno.land/x/cliffy@v0.19.2/command/mod.ts";
import { Node } from "../nodes/node.ts";
import { NodeMetadata } from "../nodes/node_metadata.ts";
import { Nodes } from "../nodes/nodes.ts";
import { Either, right } from "../../shared/either.ts";
import { Folders } from "../nodes/folders.ts";

export class UserNode extends Node {
	static create(metadata: Partial<NodeMetadata> = {}): Either<ValidationError, UserNode> {
		const node = new UserNode(metadata);

		return right(node);
	}

	email: string;
	group: string;
	groups: string[];

	private constructor(metadata: Partial<NodeMetadata> = {}) {
		super({ ...metadata, mimetype: Node.USER_MIMETYPE, parent: Folders.USERS_FOLDER_UUID });
		this.group = metadata?.group ?? "";
		this.groups = metadata?.groups ?? [];
		this.email = metadata?.email ?? "";
	}
}
