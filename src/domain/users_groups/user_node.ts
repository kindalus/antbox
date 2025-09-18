import { EmailValue } from "domain/nodes/email_value.ts";
import { Folders } from "domain/nodes/folders.ts";
import { Node } from "domain/nodes/node.ts";
import { type NodeMetadata } from "domain/nodes/node_metadata.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { AntboxError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import { ValidationError } from "shared/validation_error.ts";
import { InvalidFullNameFormatError } from "./invalid_fullname_format_error.ts";
import { InvalidSecretFormatError } from "./invalid_secret_format_error.ts";
import { UserGroupRequiredError } from "./user_group_required_error.ts";
import { createHash } from "crypto";

export class UserNode extends Node {
  #email: EmailValue;
  #group: string;
  #groups: string[];
  #secret: string | undefined;

  static shaSum(email: string, password: string): string {
    return createHash("sha512")
      .update(email + password)
      .digest("hex");
  }

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
    this.#groups = metadata?.groups ?? [];
    this.#group = metadata?.group ?? this.groups[0];
    this.#email = undefined as unknown as EmailValue;

    if (metadata.email) {
      this.#email = this.#getValidEmailOrThrowError(metadata.email);
    }

    if (metadata.secret) {
      this.#validateSecret(metadata.secret);
      this.#secret = UserNode.shaSum(this.#email.value, metadata.secret);
    }

    this.#validate();
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

    this.#group = metadata?.group ?? this.#group;
    this.#groups = metadata?.groups ?? this.#groups;

    try {
      if (metadata.secret) {
        this.#validateSecret(metadata.secret);
        this.#secret = UserNode.shaSum(this.#email.value, metadata.secret);
      }

      this.#validate();
    } catch (err) {
      return left(err as ValidationError);
    }

    return right(undefined);
  }

  #getValidEmailOrThrowError(email: string): EmailValue {
    const emailOrErr = EmailValue.fromString(email);

    if (emailOrErr.isLeft()) {
      throw emailOrErr.value;
    }

    return emailOrErr.value;
  }

  #validate() {
    const errors: AntboxError[] = [];

    if (!this.title || this.title.length < 3) {
      errors.push(new InvalidFullNameFormatError(this.title));
    }

    if (!this.#group || this.#group.length === 0) {
      errors.push(new UserGroupRequiredError());
    }

    if (errors.length > 0) {
      throw ValidationError.from(...errors);
    }
  }

  #validateSecret(secret: string) {
    if (!secret || secret.length < 8) {
      throw ValidationError.from(new InvalidSecretFormatError());
    }
  }

  get email(): string {
    return this.#email.value;
  }

  get group(): string {
    return this.#group;
  }

  get groups(): string[] {
    return this.#groups;
  }

  get secret(): string | undefined {
    return this.#secret;
  }
}
