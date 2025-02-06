import { Either, right } from "../../shared/either.ts";
import { ValidationError } from "../../shared/validation_error.ts";
import { FileNodeMixin } from "./file_node.ts";
import { NodeMetadata } from "./node_metadata.ts";
import { Node } from "./node.ts";
import { Nodes } from "./nodes.ts";
import { Folders } from "./folders.ts";

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
