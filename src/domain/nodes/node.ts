import { AntboxError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import { FidGenerator } from "shared/fid_generator.ts";
import { ValidationError } from "shared/validation_error.ts";
import { EmailValue } from "./email_value.ts";
import { Folders } from "./folders.ts";
import { InvalidMimetypeError } from "./invalid_mimetype_error.ts";
import { type NodeMetadata } from "./node_metadata.ts";
import {
  PropertyFormatError,
  PropertyRequiredError,
} from "./property_errors.ts";
import { UuidGenerator } from "shared/uuid_generator.ts";
import { z } from "zod";

const NodeValidationSchema = z.object({
  uuid: z.string().min(1, "Node.uuid is required"),
  title: z.string().min(1, "Node.title is required"),
  mimetype: z.string().regex(
    /^\w+\/[a-z0-9.-]+(;\w+=.+)?$/,
    "Invalid Mimetype",
  ),
  parent: z.string().min(1, "Node.parent is required"),
  owner: z.string().min(1, "Node.owner is required"),
});

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
    this.uuid = metadata?.uuid ?? UuidGenerator.generate();
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
    const result = NodeValidationSchema.safeParse(this.metadata);

    if (!result.success) {
      const errors: AntboxError[] = [];

      for (const issue of result.error.issues) {
        const fieldName = issue.path.length > 0
          ? String(issue.path[0])
          : "unknown";

        if (issue.code === "too_small" && issue.minimum === 1) {
          errors.push(new PropertyRequiredError(`Node.${fieldName}`));
        } else if (fieldName === "mimetype") {
          errors.push(new InvalidMimetypeError(this.#mimetype));
        } else {
          errors.push(
            new PropertyFormatError(
              `Node.${fieldName}`,
              "valid format",
              issue.message,
            ),
          );
        }
      }

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
    return this.#owner?.value;
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

  toJSON() {
    return this.metadata;
  }
}

export type Permission = "Read" | "Write" | "Export";

export type Permissions = {
  group: Permission[];
  authenticated: Permission[];
  anonymous: Permission[];
  advanced: Record<string, Permission[]>;
};
