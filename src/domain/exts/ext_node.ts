import { type Either, left, right } from "shared/either.ts";
import { ValidationError } from "shared/validation_error.ts";
import { Folders } from "domain/nodes/folders.ts";
import { Node } from "domain/nodes/node.ts";
import type { NodeMetadata } from "domain/nodes/node_metadata.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { InvalidExtNodeParentError } from "domain/exts/invalid_ext_node_parent_error.ts";
import { FileMixin } from "domain/nodes/file_mixin.ts";

export class ExtNode extends FileMixin(Node) {
  static create(
    metadata: Partial<NodeMetadata>,
  ): Either<ValidationError, ExtNode> {
    try {
      const ext = new ExtNode(metadata);
      return right(ext);
    } catch (err) {
      return left(err as ValidationError);
    }
  }

  private constructor(metadata: Partial<NodeMetadata> = {}) {
    super({
      ...metadata,
      mimetype: Nodes.EXT_MIMETYPE,
      parent: Folders.EXT_FOLDER_UUID,
    });
  }

  override update(
    metadata: Partial<NodeMetadata>,
  ): Either<ValidationError, void> {
    const updateResult = super.update(metadata);

    if (updateResult.isLeft()) {
      return left(updateResult.value);
    }

    if (this.parent !== Folders.EXT_FOLDER_UUID) {
      return left(
        ValidationError.from(new InvalidExtNodeParentError(this.parent)),
      );
    }

    return right(undefined);
  }
}
