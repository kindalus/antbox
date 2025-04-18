import type { NodeMetadata } from "domain/nodes/node_metadata.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { type Either, left, right } from "shared/either.ts";
import { ValidationError } from "shared/validation_error.ts";
import { Node } from "domain/nodes/node.ts";
import { FileMixin } from "domain/nodes/file_mixin.ts";
import { WithAspectMixin } from "domain/nodes/with_aspect_mixin.ts";

export class ArticleNode extends FileMixin(WithAspectMixin(Node)) {
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
