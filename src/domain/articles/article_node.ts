import { FileNodeMixin, WithAspectMixin } from "domain/nodes/mixins";
import type { NodeMetadata } from "domain/nodes/node_metadata";
import { Nodes } from "domain/nodes/nodes";
import { type Either, left, right } from "shared/either.ts";
import { ValidationError } from "shared/validation_error.ts";
import { Node } from "domain/nodes/node";

export class ArticleNode extends FileNodeMixin(WithAspectMixin(Node)) {
  static create(
    metadata: Partial<NodeMetadata>,
  ): Either<ValidationError, ArticleNode> {
    try {
      const file = new ArticleNode(metadata);
      return right(file);
    } catch (e) {
      return left(e as ValidationError);
    }
  }

  constructor(metadata: Partial<NodeMetadata> = {}) {
    super({
      ...metadata,
      mimetype: Nodes.ARTICLE_MIMETYPE,
    });
  }
}
