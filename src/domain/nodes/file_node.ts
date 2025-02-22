import { type Either, left, right } from "shared/either.ts";
import { ValidationError } from "shared/validation_error.ts";
import { FileNodeMixin, WithAspectMixin } from "./mixins.ts";
import { Node } from "./node.ts";
import type { NodeMetadata } from "./node_metadata.ts";

export class FileNode extends FileNodeMixin(WithAspectMixin(Node)) {
  static create(
    metadata: Partial<NodeMetadata>,
  ): Either<ValidationError, FileNode> {
    try {
      return right(new FileNode(metadata));
    } catch (error) {
      return left(error as ValidationError);
    }
  }

  private constructor(metadata: Partial<NodeMetadata> = {}) {
    super({
      ...metadata,

      mimetype:
        metadata.mimetype === "text/javascript"
          ? "application/javascript"
          : metadata.mimetype,
    });
  }
}
