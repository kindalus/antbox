import { AntboxError } from "shared/antbox_error.ts";
import { Either, left, right } from "shared/either.ts";
import { ValidationError } from "shared/validation_error.ts";
import { Folders } from "domain/nodes/folders.ts";
import { Node } from "domain/nodes/node.ts";
import { NodeMetadata } from "domain/nodes/node_metadata.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { PropertyRequiredError } from "domain/nodes/property_errors.ts";

export class ApiKeyNode extends Node {
  #group: string = null as unknown as string;
  #secret: string = null as unknown as string;

  static create(
    metadata: Partial<NodeMetadata>,
  ): Either<ValidationError, ApiKeyNode> {
    try {
      const node = new ApiKeyNode(metadata);

      return right(node);
    } catch (e) {
      return left(ValidationError.from(e as AntboxError));
    }
  }

  private constructor(metadata: Partial<NodeMetadata>) {
    super({
      ...metadata,
      mimetype: Nodes.API_KEY_MIMETYPE,
      parent: Folders.API_KEYS_FOLDER_UUID,
      title: metadata.secret && metadata.secret.length > 0
        ? metadata.secret.replace(/^(\w{4}).*$/g, "$1******")
        : metadata.title || "API Key",
    });

    this.#group = metadata.group!;
    this.#secret = metadata.secret!;

    this.#validate();
  }

  override update(
    metadata: Partial<NodeMetadata>,
  ): Either<ValidationError, void> {
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
      errors.push(
        ValidationError.from(new PropertyRequiredError("Node.group")),
      );
    }

    if (!this.#secret || this.#secret.length === 0) {
      errors.push(
        ValidationError.from(new PropertyRequiredError("Node.secret")),
      );
    }

    if (errors.length > 0) {
      throw ValidationError.from(...errors);
    }
  }

  get group(): string {
    return this.#group;
  }

  get secret(): string {
    return this.#secret;
  }
}
