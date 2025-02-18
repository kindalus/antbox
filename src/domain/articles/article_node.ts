import { Either, right } from "../../shared/either.ts";
import { ValidationError } from "../../shared/validation_error.ts";
import { NodeMetadata } from "../nodes/node_metadata.ts";
import { Nodes } from "../nodes/nodes.ts";
import { Node } from "../nodes/node.ts";
import { FileNodeMixin, WithAspectMixin } from "../nodes/mixins.ts";

export class ArticleNode extends FileNodeMixin(WithAspectMixin(Node)) {
	static create(
		metadata: Partial<NodeMetadata>,
	): Either<ValidationError, ArticleNode> {
		const file = new ArticleNode(metadata);
		return right(file);
	}

	constructor(metadata: Partial<NodeMetadata> = {}) {
		super({
			...metadata,
			mimetype: Nodes.ARTICLE_MIMETYPE,
		});
	}
}
