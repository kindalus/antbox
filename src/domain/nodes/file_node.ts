import { Either, right } from "../../shared/either.ts";
import { ValidationError } from "../../shared/validation_error.ts";
import { FileNodeMixin, WithAspectMixin } from "./mixins.ts";
import { Node } from "./node.ts";
import { NodeMetadata } from "./node_metadata.ts";

export class FileNode extends FileNodeMixin(WithAspectMixin(Node)) {
	static create(
		metadata: Partial<NodeMetadata>,
	): Either<ValidationError, FileNode> {
		const file = new FileNode(metadata);
		return right(file);
	}

	constructor(metadata: Partial<NodeMetadata> = {}) {
		super({
			...metadata,

			mimetype: metadata.mimetype === "text/javascript"
				? "application/javascript"
				: metadata.mimetype,
		});
	}
}
