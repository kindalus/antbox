import { Folders } from "domain/nodes/folders.ts";
import type { NodeMetadata } from "domain/nodes/node_metadata.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { PropertyRequiredError } from "domain/nodes/property_errors.ts";
import { AntboxError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import { ValidationError } from "shared/validation_error.ts";
import { Node } from "domain/nodes/node.ts";
import { compareSync, genSaltSync, hashSync } from "bcryptjs";

export class ApiKeyNode extends Node {
  #group: string = null as unknown as string;
  #secret: string = null as unknown as string;

  static generateSecureKey(secret: string): string {
    const salt = genSaltSync(10);
    return hashSync(secret, salt);
  }

  static isSecureKey(key: string): boolean {
    return compareSync(key, this.generateSecureKey(key));
  }

  static create(metadata: Partial<NodeMetadata>): Either<ValidationError, ApiKeyNode> {
    try {
      const node = new ApiKeyNode(
        metadata.group,
        metadata.secret,
        metadata.description,
        metadata.owner,
      );

      return right(node);
    } catch (e) {
      return left(ValidationError.from(e as AntboxError));
    }
  }

  private constructor(group = "", secret = "", description = "", owner = "") {
    const errors = [];

    if (!secret || secret.length === 0) {
      errors.push(new PropertyRequiredError("Node.secret"));
    }

    if (!group || group.length === 0) {
      errors.push(new PropertyRequiredError("Node.group"));
    }

    if (errors.length > 0) {
      throw ValidationError.from(...errors);
    }

    super({
      description,
      mimetype: Nodes.API_KEY_MIMETYPE,
      parent: Folders.API_KEYS_FOLDER_UUID,
      title: secret.replace(/^(\w{4}).*$/g, "$1******"),
      owner,
    });

    this.#group = group;
    this.#secret = ApiKeyNode.generateSecureKey(secret);
  }

  override update(metadata: Partial<NodeMetadata>): Either<ValidationError, void> {
    const superUpdateResult = super.update({
      ...metadata,
      parent: Folders.API_KEYS_FOLDER_UUID,
    });

    if (superUpdateResult.isLeft()) {
      return superUpdateResult;
    }

    this.#group = metadata.group ?? this.#group;
    this.#secret = metadata.secret ?? this.#secret;

    try {
      this.#validate();
    } catch (e) {
      return left(e as ValidationError);
    }

    return right(undefined);
  }

  #validate() {
    const errors = [];

    if (!this.#group || this.#group.length === 0) {
      errors.push(ValidationError.from(new PropertyRequiredError("Node.group")));
    }

    if (!this.#secret || this.#secret.length === 0) {
      errors.push(ValidationError.from(new PropertyRequiredError("Node.secret")));
    }

    if (errors.length > 0) {
      throw ValidationError.from(...errors);
    }
  }

  cloneWithSecret(): ApiKeyNode {
    return new ApiKeyNode(this.#group, this.#secret, this.description, this.owner);
  }

  get group(): string {
    return this.#group;
  }

  get secret(): string {
    return this.#secret;
  }
}
