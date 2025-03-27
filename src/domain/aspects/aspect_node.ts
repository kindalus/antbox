import { type Either, left, right } from "shared/either.ts";
import { ValidationError } from "shared/validation_error.ts";
import { Folders } from "domain/nodes/folders.ts";
import { Node } from "domain/nodes/node.ts";

import { type NodeMetadata } from "domain/nodes/node_metadata.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import type { NodeFilters } from "domain/nodes/node_filter.ts";

export class AspectNode extends Node {
  static create(metadata: Partial<NodeMetadata>): Either<ValidationError, AspectNode> {
    try {
      const node = new AspectNode(metadata);
      return right(node);
    } catch (e) {
      return left(e as ValidationError);
    }
  }

  filters: NodeFilters;
  properties: AspectProperty[];

  private constructor(metadata: Partial<NodeMetadata> = {}) {
    super({
      ...metadata,
      mimetype: Nodes.ASPECT_MIMETYPE,
      parent: Folders.ASPECTS_FOLDER_UUID,
    });

    this.filters = metadata.filters ?? [];
    this.properties = (metadata.properties as AspectProperty[]) ?? [];
  }

  update(metadata: Partial<NodeMetadata>): Either<ValidationError, void> {
    if (metadata.filters) {
      this.filters = metadata.filters;
    }

    if (metadata.properties) {
      this.properties = metadata.properties;
    }

    return super.update(metadata);
  }
}

export interface AspectProperty {
  /**
   * regex /[a-zA-Z_][_a-zA-Z0-9_]{2,}/;
   */
  name: string;
  title: string;
  type: PropertyType;

  readonly?: boolean;
  validationRegex?: string;
  validationList?: string[];
  validationFilters?: NodeFilters;
  required?: boolean;
  searchable?: boolean;
  default?: unknown;
}

export type AspectProperties = AspectProperty[];

export type PropertyType =
  | "boolean"
  | "date"
  | "dateTime"
  | "json"
  | "number"
  | "number[]"
  | "richText"
  | "string"
  | "string[]"
  | "text"
  | "uuid"
  | "uuid[]";
