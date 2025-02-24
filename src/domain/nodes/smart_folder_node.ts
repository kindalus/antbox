import { Nodes } from "./nodes.ts";
import { type NodeMetadata } from "./node_metadata.ts";
import { Node } from "./node.ts";
import { type NodeFilter } from "./node_filter.ts";
import { type Either, right } from "shared/either.ts";
import { ValidationError } from "shared/validation_error.ts";

export class SmartFolderNode extends Node {
  static create(
    metadata: Partial<SmartFolderNode> = {},
  ): Either<ValidationError, SmartFolderNode> {
    const node = new SmartFolderNode(metadata);
    return right(node);
  }

  filters: NodeFilter[];

  constructor(metadata: Partial<NodeMetadata> = {}) {
    super({ ...metadata, mimetype: Nodes.SMART_FOLDER_MIMETYPE });

    this.filters = metadata.filters ?? [];
  }
}
