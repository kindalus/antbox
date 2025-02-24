import { AntboxError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import { FidGenerator } from "shared/fid_generator.ts";
import { ValidationError } from "shared/validation_error.ts";
import { EmailValue } from "./email_value.ts";
import { Folders } from "./folders.ts";
import { InvalidMimetypeError } from "./invalid_mimetype_error.ts";
import { type NodeMetadata } from "./node_metadata.ts";
import { PropertyRequiredError } from "./property_required_error.ts";

export class Node {
  readonly uuid: string;
  readonly #mimetype: string;
  readonly #owner: EmailValue;
  readonly #createdTime: string;

  #fid: string;
  #title: string;
  #description?: string;
  #parent = Folders.ROOT_FOLDER_UUID;
  #modifiedTime: string;
  #fulltext: string;

  constructor(metadata: Partial<NodeMetadata> = {}) {
    this.uuid = metadata?.uuid ?? "";
    this.#mimetype = metadata?.mimetype ?? "";
    this.#fid = metadata?.fid ?? "";
    this.#title = metadata?.title ?? "";
    this.#description = metadata?.description;
    this.#parent = metadata?.parent ?? Folders.ROOT_FOLDER_UUID;
    this.#createdTime = metadata?.createdTime ?? new Date().toISOString();
    this.#modifiedTime = metadata?.modifiedTime ?? new Date().toISOString();

    this.#owner = undefined as unknown as EmailValue;
    if (metadata.owner) {
      const ownerOrErr = EmailValue.fromString(metadata.owner);

      if (ownerOrErr.isLeft()) {
        throw ownerOrErr.value;
      }
      this.#owner = ownerOrErr.value;
    }

    this.#fulltext = metadata?.fulltext ?? "";

    this.#validate();

    if (!this.#fid?.length) {
      this.#fid = FidGenerator.generate(this.#title);
    }
  }

  isJson(): boolean {
    return this.#mimetype === "application/json";
  }

  #validate() {
    const errors: AntboxError[] = [];

    if (!this.#title || this.#title.length === 0) {
      errors.push(new PropertyRequiredError("Node.title"));
    }

    if (!this.mimetype || !/^\w+\/[a-z0-9.-]+$/.test(this.mimetype)) {
      errors.push(new InvalidMimetypeError(this.mimetype));
    }

    if (!this.parent || this.parent.length === 0) {
      errors.push(new PropertyRequiredError("Node.parent"));
    }

    if (!this.#owner) {
      errors.push(new PropertyRequiredError("Node.owner"));
    }

    if (errors.length > 0) {
      throw ValidationError.from(...errors);
    }
  }

  update(metadata: Partial<NodeMetadata>): Either<ValidationError, void> {
    this.#title = metadata.title ?? this.#title;
    this.#fid = metadata.fid ?? this.#fid;
    this.#description = metadata.description ?? this.#description;
    this.#parent = metadata.parent ?? this.#parent;
    this.#modifiedTime = new Date().toISOString();
    this.#fulltext = metadata.fulltext ?? this.#fulltext;

    if (!this.#fid?.length) {
      this.#fid = FidGenerator.generate(this.#title);
    }

    try {
      this.#validate();
    } catch (err) {
      return left(err as ValidationError);
    }

    return right(undefined);
  }

  get fid(): string {
    return this.#fid;
  }

  get title(): string {
    return this.#title;
  }

  get description(): string | undefined {
    return this.#description;
  }

  get mimetype(): string {
    return this.#mimetype;
  }

  get parent(): string {
    return this.#parent;
  }

  get createdTime(): string {
    return this.#createdTime;
  }

  get modifiedTime(): string {
    return this.#modifiedTime;
  }

  get owner(): string {
    return this.#owner.value;
  }

  get fulltext(): string {
    return this.#fulltext;
  }

  get metadata(): Partial<NodeMetadata> {
    return {
      uuid: this.uuid,
      fid: this.fid,
      title: this.title,
      description: this.description,
      mimetype: this.mimetype,
      parent: this.parent,
      owner: this.owner,
      createdTime: this.createdTime,
      modifiedTime: this.modifiedTime,
      fulltext: this.fulltext,
    };
  }
}

export type Permission = "Read" | "Write" | "Export";

export type Permissions = {
  group: Permission[];
  authenticated: Permission[];
  anonymous: Permission[];
  advanced: Record<string, Permission[]>;
};
