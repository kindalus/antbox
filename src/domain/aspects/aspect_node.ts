import { type Either, left, right } from "shared/either.ts";
import { ValidationError } from "shared/validation_error.ts";
import { Folders } from "domain/nodes/folders.ts";
import { Node } from "domain/nodes/node.ts";

import { type NodeMetadata } from "domain/nodes/node_metadata.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import type { NodeFilters } from "domain/nodes/node_filter.ts";
import z from "zod";
import { AntboxError } from "shared/antbox_error.ts";
import { toPropertyError } from "../validation_schemas.ts";

const AspectNodeValidationSchema = z.object({
  mimetype: z.literal(
    Nodes.ASPECT_MIMETYPE,
    "AspectNode.mimetype must be aspect",
  ),
  parent: z.literal(
    Folders.ASPECTS_FOLDER_UUID,
    "AspectNode.parent must be aspects folder",
  ),
});

export class AspectNode extends Node {
  static create(
    metadata: Partial<NodeMetadata>,
  ): Either<ValidationError, AspectNode> {
    try {
      const node = new AspectNode(metadata);
      return right(node);
    } catch (e) {
      return left(e as ValidationError);
    }
  }

  protected _filters: NodeFilters;
  protected _properties: AspectProperties;

  private constructor(metadata: Partial<NodeMetadata> = {}) {
    super({
      ...metadata,
      mimetype: Nodes.ASPECT_MIMETYPE,
      parent: Folders.ASPECTS_FOLDER_UUID,
    });

    this._filters = metadata.filters ?? [];
    this._properties = (metadata.properties as AspectProperty[]) ?? [];
  }

  override update(
    metadata: Partial<NodeMetadata>,
  ): Either<ValidationError, void> {
    if (metadata.filters) {
      this._filters = metadata.filters;
    }

    if (metadata.properties && metadata.properties.pop) {
      this._properties = metadata.properties as AspectProperties;
    }

    const result = super.update({
      ...metadata,
      mimetype: Nodes.ASPECT_MIMETYPE,
      parent: Folders.ASPECTS_FOLDER_UUID,
    });
    if (result.isLeft()) {
      return left(result.value);
    }

    try {
      this._validateAspectNode();
    } catch (e) {
      return left(e as ValidationError);
    }

    return right(undefined);
  }

  get properties(): AspectProperties {
    return this._properties;
  }

  get filters(): NodeFilters {
    return this._filters;
  }

  protected _validateAspectNode() {
    const errors: AntboxError[] = [];

    const nodeErrors = this._safeValidateNode();

    if (nodeErrors) {
      errors.push(...nodeErrors.errors);
    }

    const result = AspectNodeValidationSchema.safeParse(this.metadata);
    if (!result.success) {
      errors.push(...(result.error.issues.map(toPropertyError("AspectNode"))));
    }

    if (errors.length) {
      throw ValidationError.from(...errors);
    }
  }
}

export interface AspectProperty {
  /**
   * regex /[a-zA-Z_][_a-zA-Z0-9_]{2,}/;
   */
  name: string;
  title: string;

  type: "uuid" | "string" | "number" | "boolean" | "object" | "array" | "file";
  arrayType?: "string" | "number" | "uuid" | "object";
  stringMimetype?: string;

  readonly?: boolean;
  validationRegex?: string;
  validationList?: string[];
  validationFilters?: NodeFilters;
  required?: boolean;
  searchable?: boolean;
  default?: unknown;
}

export type AspectProperties = AspectProperty[];
