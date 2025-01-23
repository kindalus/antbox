import { Either, right } from "../../shared/either.ts";
import { ValidationError } from "../../shared/validation_error.ts";
import { Node, WithAspectMixin } from "./node.ts";
import { NodeMetadata } from "./node_metadata.ts";
import { Nodes } from "./nodes.ts";

export class MetaNode extends WithAspectMixin(Node) {
	static create(metadata: Partial<NodeMetadata>): Either<ValidationError, MetaNode> {
		const node = new MetaNode(metadata);

		return right(node);
	}

	constructor(metadata: Partial<NodeMetadata> = {}) {
		super({ ...metadata, mimetype: Nodes.META_NODE_MIMETYPE });
	}

	override isMetaNode(): this is MetaNode {
		return true;
	}
}
