import { Either, right } from "../../shared/either.ts";
import { ValidationError } from "../../shared/validation_error.ts";
import { NodeMetadata } from "../nodes/node_metadata.ts";
import { Node } from "../nodes/node.ts";
import { Nodes } from "../nodes/nodes.ts";
import { Folders } from "../nodes/folders.ts";
import { FileNodeMixin } from "../nodes/mixins.ts";

export class ExtNode extends FileNodeMixin(Node) {
	static create(metadata: Partial<NodeMetadata>): Either<ValidationError, ExtNode> {
		const ext = new ExtNode(metadata);

		return right(ext);
	}

	constructor(metadata: Partial<NodeMetadata> = {}) {
		super({
			...metadata,
			mimetype: Nodes.ACTION_MIMETYPE,
			parent: Folders.ACTIONS_FOLDER_UUID,
		});
	}
}
