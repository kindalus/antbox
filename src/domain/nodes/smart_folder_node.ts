import { Nodes } from "./nodes.ts";
import { type NodeMetadata } from "./node_metadata.ts";
import { Node } from "./node.ts";
import { type NodeFilters } from "./node_filter.ts";
import { type Either, left, right } from "shared/either.ts";
import { ValidationError } from "shared/validation_error.ts";
import {
  PropertyFormatError,
  PropertyRequiredError,
} from "./property_errors.ts";
import { AntboxError } from "shared/antbox_error.ts";
import { z } from "zod";

const SmartFolderValidationSchema = z.object({
  filters: z.array(z.any()).min(1, "filters is required"),
});

export class SmartFolderNode extends Node {
  static create(
    metadata: Partial<SmartFolderNode> = {},
  ): Either<ValidationError, SmartFolderNode> {
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

  override update(
    metadata: Partial<NodeMetadata>,
  ): Either<ValidationError, void> {
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

  override get metadata(): Partial<NodeMetadata> {
    return {
      ...super.metadata,
      filters: this.#filters,
    };
  }

  #validate() {
    const result = SmartFolderValidationSchema.safeParse(this.metadata);

    if (!result.success) {
      const errors: AntboxError[] = [];

      for (const issue of result.error.issues) {
        const fieldName = issue.path.length > 0
          ? String(issue.path[0])
          : "unknown";

        if (fieldName === "filters") {
          errors.push(new PropertyRequiredError("filters"));
        } else {
          errors.push(
            new PropertyFormatError(
              fieldName,
              "valid format",
              issue.message,
            ),
          );
        }
      }

      throw ValidationError.from(...errors);
    }
  }
}
