import { type Either, left, right } from "shared/either.ts";
import { ValidationError } from "shared/validation_error.ts";
import { Node } from "./node.ts";
import { type NodeMetadata } from "./node_metadata.ts";
import { Nodes } from "./nodes.ts";
import { WithAspectMixin } from "domain/nodes/with_aspect_mixin.ts";

export class MetaNode extends WithAspectMixin(Node) {
	static create(
		metadata: Partial<NodeMetadata>,
	): Either<ValidationError, MetaNode> {
		try {
			return right(new MetaNode(metadata));
		} catch (err) {
			return left(err as ValidationError);
		}
	}

	constructor(metadata: Partial<NodeMetadata> = {}) {
		super({ ...metadata, mimetype: Nodes.META_NODE_MIMETYPE });
	}
}
