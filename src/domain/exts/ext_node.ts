import { type Either, right } from "shared/either.ts";
import { ValidationError } from "shared/validation_error.ts";
import { type NodeMetadata } from "domain/nodes/node_metadata.ts";
import { Node } from "domain/nodes/node.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { Folders } from "domain/nodes/folders.ts";
import { FileNodeMixin } from "domain/nodes/mixins.ts";

export class ExtNode extends FileNodeMixin(Node) {
  static create(
    metadata: Partial<NodeMetadata>,
  ): Either<ValidationError, ExtNode> {
    const ext = new ExtNode(metadata);

    return right(ext);
  }

  constructor(metadata: Partial<NodeMetadata> = {}) {
    super({
      ...metadata,
      mimetype: Nodes.ACTION_MIMETYPE,
      parent: Folders.ACTIONS_FOLDER_UUID,
    });
  }
}
