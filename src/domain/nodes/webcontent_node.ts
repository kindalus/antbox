import { Either, right } from "../../shared/either.ts";
import { ValidationError } from "../../shared/validation_error.ts";
import { FileNodeMixin } from "./file_node.ts";
import { Node, WithAspectMixin } from "./node.ts";
import { NodeMetadata } from "./node_metadata.ts";
import { Nodes } from "./nodes.ts";

export class WebcontentNode extends FileNodeMixin(WithAspectMixin(Node)) {
	static create(
		metadata: Partial<NodeMetadata>,
	): Either<ValidationError, WebcontentNode> {
		const file = new WebcontentNode(metadata);
		return right(file);
	}

	constructor(metadata: Partial<NodeMetadata> = {}) {
		super({
			...metadata,
			mimetype: Nodes.WEB_CONTENT_MIMETYPE,
		});
	}
}
