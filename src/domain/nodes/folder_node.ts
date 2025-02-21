import { type Either, left, right } from "../../shared/either.ts";
import { ValidationError } from "../../shared/validation_error.ts";
import { FolderNodeMixin, WithAspectMixin } from "./mixins.ts";
import { Node } from "./node.ts";
import { type NodeMetadata } from "./node_metadata.ts";

export class FolderNode extends FolderNodeMixin(WithAspectMixin(Node)) {
	static create(
		metadata: Partial<NodeMetadata>,
	): Either<ValidationError, FolderNode> {
		try {
			return right(new FolderNode(metadata));
		} catch (err) {
			return left(err as ValidationError);
		}
	}

	private constructor(metadata: Partial<NodeMetadata>) {
		super(metadata);
	}
}
