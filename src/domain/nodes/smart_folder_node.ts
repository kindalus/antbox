import { Nodes } from "./nodes.ts";
import { type NodeMetadata } from "./node_metadata.ts";
import { Node } from "./node.ts";
import { type NodeFilters } from "./node_filter.ts";
import { type Either, left, right } from "shared/either.ts";
import { ValidationError } from "shared/validation_error.ts";
import { PropertyRequiredError } from "./property_required_error.ts";

export class SmartFolderNode extends Node {
  static create(metadata: Partial<SmartFolderNode> = {}): Either<ValidationError, SmartFolderNode> {
    try {
      return right(new SmartFolderNode(metadata));
    } catch (err) {
      return left(err as ValidationError);
    }
  }

  #filters: NodeFilters;

  constructor(metadata: Partial<NodeMetadata> = {}) {
    super({ ...metadata, mimetype: Nodes.SMART_FOLDER_MIMETYPE });

    this.#filters = metadata.filters ?? [];

    this.#validate();
  }

  get filters(): NodeFilters {
    return this.#filters;
  }

  update(metadata: Partial<NodeMetadata>): Either<ValidationError, void> {
    try {
      if (!metadata.filters?.length) {
        return left(ValidationError.from(new PropertyRequiredError("filters")));
      }
      this.#filters = metadata.filters!;

      return super.update(metadata);
    } catch (err) {
      return left(err as ValidationError);
    }
  }

  #validate() {
    if (!this.#filters?.length) {
      throw ValidationError.from(new PropertyRequiredError("filters"));
    }
  }
}
