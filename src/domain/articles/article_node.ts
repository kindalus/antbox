import { type Either, left, right } from "../../shared/either.ts";
import { ValidationError } from "../../shared/validation_error.ts";
import { FileNodeMixin, WithAspectMixin } from "../nodes/mixins.ts";
import { Node } from "../nodes/node.ts";
import { type NodeMetadata } from "../nodes/node_metadata.ts";
import { Nodes } from "../nodes/nodes.ts";

export class ArticleNode extends FileNodeMixin(WithAspectMixin(Node)) {
	static create(
		metadata: Partial<NodeMetadata>,
	): Either<ValidationError, ArticleNode> {
		
		try {
			const file = new ArticleNode(metadata);
			return right(file);
		}catch(e) {
			return left(e as ValidationError)
		}
	}

	constructor(metadata: Partial<NodeMetadata> = {}) {
		super({
			...metadata,
			mimetype: Nodes.ARTICLE_MIMETYPE,
		});
	}
}
