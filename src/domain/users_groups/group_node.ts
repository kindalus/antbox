import { type Either, left, right } from "shared/either.ts";
import { ValidationError } from "shared/validation_error.ts";
import { Folders } from "domain/nodes/folders.ts";
import { Node } from "domain/nodes/node.ts";
import { type NodeMetadata } from "domain/nodes/node_metadata.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { InvalidFullNameFormatError } from "./invalid_fullname_format_error.ts";
import { PropertyFormatError } from "domain/nodes/property_errors.ts";
import { AntboxError } from "shared/antbox_error.ts";
import { z } from "zod";

const GroupValidationSchema = z.object({
  title: z.string().min(3, "Invalid Fullname Format"),
});

export class GroupNode extends Node {
  static create(
    metadata: Partial<NodeMetadata>,
  ): Either<ValidationError, GroupNode> {
    try {
      const group = new GroupNode(metadata);

      return right(group);
    } catch (err) {
      return left(err as ValidationError);
    }
  }

  constructor(metadata: Partial<NodeMetadata> = {}) {
    super({
      ...metadata,
      mimetype: Nodes.GROUP_MIMETYPE,
      parent: Folders.GROUPS_FOLDER_UUID,
    });

    this.#validate();
  }

  override update(
    metadata: Partial<NodeMetadata>,
  ): Either<ValidationError, void> {
    const superUpdateResult = super.update({
      ...metadata,
      parent: Folders.GROUPS_FOLDER_UUID,
    });

    if (superUpdateResult.isLeft()) {
      return superUpdateResult;
    }

    try {
      this.#validate();

      return right(undefined);
    } catch (e) {
      return left(e as ValidationError);
    }
  }

  #validate() {
    const result = GroupValidationSchema.safeParse(this.metadata);

    if (!result.success) {
      const errors: AntboxError[] = [];

      for (const issue of result.error.issues) {
        const fieldName = issue.path.length > 0
          ? String(issue.path[0])
          : "unknown";

        if (fieldName === "title") {
          errors.push(new InvalidFullNameFormatError(this.title));
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
