import { Either, left, right } from "../../shared/either.ts";
import { ValidationError } from "../../shared/validation_error.ts";
import { Folders } from "../nodes/folders.ts";
import { FileNodeMixin } from "../nodes/mixins.ts";
import { Node } from "../nodes/node.ts";
import { NodeMetadata } from "../nodes/node_metadata.ts";
import { Nodes } from "../nodes/nodes.ts";
import { InvalidExtNodeParentError } from "./invalid_ext_node_parent_error.ts";

export class ExtNode extends FileNodeMixin(Node) {
	static create(metadata: Partial<NodeMetadata>): Either<ValidationError, ExtNode> {
		try{
			const ext = new ExtNode(metadata);
			return right(ext);
		}catch(err) {
			return left(ValidationError.from(err))
		}
	}

	private constructor(metadata: Partial<NodeMetadata> = {}) {
		super({
			...metadata,
			mimetype: Nodes.EXT_MIMETYPE,
			parent: Folders.EXT_FOLDER_UUID,
		});
	}

	override update(metadata: Partial<NodeMetadata>): Either<ValidationError, void> {
		const updateResult = super.update(metadata)

		if (updateResult.isLeft()) {
			return left(updateResult.value)
		}

		if (this.parent !== Folders.EXT_FOLDER_UUID) {
			return left(ValidationError.from(new InvalidExtNodeParentError(this.parent)))
		}

		return right(undefined)
	}
}
