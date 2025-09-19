import { Folders } from "domain/nodes/folders.ts";
import { Node } from "domain/nodes/node.ts";
import { type NodeMetadata } from "domain/nodes/node_metadata.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { AntboxError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import { ValidationError } from "shared/validation_error.ts";
import {
  PropertyFormatError,
  PropertyRequiredError,
  PropertyTypeError,
  UnknownPropertyError,
} from "domain/nodes/property_errors.ts";
import { z } from "zod";

const UserValidationSchema = z.object({
  // Title must have at least first name and last name
  title: z.string().regex(
    /^\s*\S+(?:\s+\S+)+\s*$/,
    "Full name must include at least first name and last name",
  ),
  group: z.string().min(1, "User must have at least one group"),
  email: z.email().min(1, "User email is required"),
  groups: z.array(z.string()),
});

export class UserNode extends Node {
  protected _email: string;
  protected _group: string;
  protected _groups: string[];

  static create(
    metadata: Partial<NodeMetadata> = {},
  ): Either<ValidationError, UserNode> {
    try {
      const node = new UserNode(metadata);
      return right(node);
    } catch (err) {
      return left(err as ValidationError);
    }
  }

  private constructor(metadata: Partial<NodeMetadata> = {}) {
    super({
      ...metadata,
      mimetype: Nodes.USER_MIMETYPE,
      parent: Folders.USERS_FOLDER_UUID,
    });

    this._groups = metadata?.groups ?? [];
    this._group = metadata?.group ?? this._groups[0];
    this._email = metadata.email!;

    this._validateUserNode();
  }

  override update(
    metadata: Partial<NodeMetadata>,
  ): Either<ValidationError, void> {
    const superUpdateResult = super.update({
      ...metadata,
      parent: Folders.USERS_FOLDER_UUID,
    });

    if (superUpdateResult.isLeft()) {
      return superUpdateResult;
    }

    this._group = metadata?.group ?? this._group;
    this._groups = metadata?.groups ?? this._groups;

    try {
      this._validateUserNode();
    } catch (err) {
      return left(err as ValidationError);
    }

    return right(undefined);
  }

  protected _validateUserNode() {
    const result = UserValidationSchema.safeParse(this.metadata);

    if (!result.success) {
      const errors: AntboxError[] = [];

      for (const issue of result.error.issues) {
        const fieldName = issue.path.length > 0
          ? String(issue.path[0])
          : "unknown";

        switch (issue.code) {
          case "too_small":
            errors.push(new PropertyRequiredError(fieldName));
            break;

          case "invalid_format":
            errors.push(
              new PropertyFormatError(fieldName, issue.format, issue.message),
            );
            break;

          case "invalid_type":
            errors.push(
              new PropertyTypeError(fieldName, issue.expected, issue.message),
            );
            break;

          default:
            errors.push(new UnknownPropertyError(fieldName, issue.message));
        }

        throw ValidationError.from(...errors);
      }
    }
  }
  get email(): string {
    return this._email;
  }

  get group(): string {
    return this._group;
  }

  get groups(): string[] {
    return this._groups;
  }
}
