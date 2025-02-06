import { Either, right } from "../../shared/either.ts";
import { ValidationError } from "../../shared/validation_error.ts";
import { Folders } from "../nodes/folders.ts";
import { Node } from "../nodes/node.ts";
import { NodeMetadata } from "../nodes/node_metadata.ts";
import { Nodes } from "../nodes/nodes.ts";

export class GroupNode extends Node {
	static create(metadata: Partial<NodeMetadata>): Either<ValidationError, GroupNode> {
		const group = new GroupNode(metadata);

		return right(group);
	}

	constructor(metadata: Partial<NodeMetadata> = {}) {
		super({
			...metadata,
			mimetype: Nodes.GROUP_MIMETYPE,
			parent: Folders.GROUPS_FOLDER_UUID,
		});
	}
}
