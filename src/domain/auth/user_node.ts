import { AntboxError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import { ValidationError } from "shared/validation_error.ts";
import { EmailValue } from "domain/nodes/email_value.ts";
import { Folders } from "domain/nodes/folders.ts";
import { Node } from "domain/nodes/node.ts";
import { type NodeMetadata } from "domain/nodes/node_metadata.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { InvalidFullNameFormatError } from "./invalid_fullname_format_error.ts";
import { InvalidPasswordFormatError } from "./invalid_password_format_error.ts";
import { UserGroupRequiredError } from "./user_group_required_error.ts";

export class UserNode extends Node {
  #email: EmailValue;
  #group: string;
  #groups: string[];
  #secret: string | undefined;

  static async shaSum(email: string, password: string): Promise<string> {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(email.concat(password));

    const hashBuffer = await crypto.subtle.digest("SHA-512", dataBuffer);

    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
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
    this.#group = metadata?.group ?? "";
    this.#groups = metadata?.groups ?? [];
    this.#email = undefined as unknown as EmailValue;

    if (metadata.email) {
      this.#email = this.#getValidEmailOrThrowError(metadata.email);
    }

    if (metadata.secret) {
      this.#validateSecretComplexity(metadata.secret);
      UserNode.shaSum(this.#email.value, metadata.secret).then((hash) => {
        this.#secret = hash;
      });
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
        this.#validateSecretComplexity(metadata.secret);
        UserNode.shaSum(this.#email.value, metadata.secret).then((hash) => {
          this.#secret = hash;
        });
      }

      if (metadata.email) {
        this.#email =
          this.#getValidEmailOrThrowError(metadata.email) ?? this.#email;
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

  #validateSecretComplexity(secret: string): void {
    if (secret.length < 8) {
      throw ValidationError.from(new InvalidPasswordFormatError());
    }
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
