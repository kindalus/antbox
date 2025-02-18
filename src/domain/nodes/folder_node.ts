import { Either, right } from "../../shared/either.ts";
import { ValidationError } from "../../shared/validation_error.ts";
import { FolderNodeMixin, WithAspectMixin } from "./mixins.ts";
import { Node } from "./node.ts";
import { NodeMetadata } from "./node_metadata.ts";

export class FolderNode extends FolderNodeMixin(WithAspectMixin(Node)) {
	static create(
		metadata: Partial<NodeMetadata>,
	): Either<ValidationError, FolderNode> {
		const node = new FolderNode(metadata);

		return right(node);
	}

	private constructor(metadata: Partial<NodeMetadata>) {
		super(metadata);
	}
}
