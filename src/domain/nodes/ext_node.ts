import { Either, right } from "../../shared/either.ts";
import { ValidationError } from "../../shared/validation_error.ts";
import { FileNodeMixin } from "./file_node.ts";
import { Node } from "./node.ts";
import { NodeMetadata } from "./node_metadata.ts";
import { Nodes } from "./nodes.ts";

export class ExtNode extends FileNodeMixin(Node) {
	static create(metadata: Partial<NodeMetadata>): Either<ValidationError, ExtNode> {
		const ext = new ExtNode(metadata);

		return right(ext);
	}

	constructor(metadata: Partial<NodeMetadata> = {}) {
		super({ ...metadata, mimetype: Nodes.ACTION_MIMETYPE, parent: Nodes.ACTIONS_FOLDER_UUID });
	}

	override isExt(): this is ExtNode {
		return true;
	}
}
