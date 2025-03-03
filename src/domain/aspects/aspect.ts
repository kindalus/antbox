import { builtinAspects } from "application/builtin_aspects/mod.ts";
import { type NodeFilter, type NodeFilters } from "domain/nodes/node_filter.ts";
import { AspectNode } from "./aspect_node.ts";
import type { NodeLike } from "domain/nodes/node_like.ts";
import { type Either, left, right } from "shared/either.ts";
import { ValidationError } from "shared/validation_error.ts";
import type { AntboxError } from "shared/antbox_error.ts";

export interface Aspect {
  uuid: string;
  title: string;
  description?: string;
  builtIn: boolean;
  filters: NodeFilters;
  properties: AspectProperty[];
}

export interface AspectProperty {
  /**
   * regex /[a-zA-Z_][_a-zA-Z0-9_]{2,}/;
   */
  name: string;
  title: string;
  type: PropertyType;

  //TODO: Dont't really know how to enforce this, for now in application layer
  readonly: boolean;

  /**
   * Opcional
   */
  validationRegex?: string;

  /**
   * Opcional
   */
  validationList?: string[];

  /**
   * Opcional - Lista de UUIDS de um determinado aspecto
   * Utilizado quando a propriedade é validada através dos nós de um aspecto
   * O tipo da propriedade deve ser UUID ou UUID[]
   */
  validationFilters?: NodeFilter[];

  required: boolean;

  searchable: boolean;

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

export function nodeToAspect(aspect: AspectNode): Aspect {
  return {
    uuid: aspect.uuid,
    title: aspect.title,
    description: aspect.description,
    builtIn: builtinAspects.find((a) => a.uuid === aspect.uuid) !== undefined,
    filters: aspect.filters,
    properties: aspect.properties,
  };
}

export function aspectToNode(aspect: Aspect): AspectNode {
  return AspectNode.create({
    uuid: aspect.uuid,
    title: aspect.title,
    description: aspect.description,
    filters: aspect.filters,
    properties: aspect.properties,
  }).right;
}

function buildAspectPropertyValidator(
  aspect: AspectNode,
  property: AspectProperty,
): (n: NodeLike) => Either<ValidationError, boolean> {
  return (n: NodeLike) => {
    return right(true);
  };
}

export function buildAspectValidator(
  aspect: AspectNode,
): (n: NodeLike) => Either<ValidationError, boolean> {
  const validators = aspect.properties.map((property) =>
    buildAspectPropertyValidator(aspect, property),
  );

  return (n: NodeLike) => {
    const errors: AntboxError[] = [];

    for (const validate of validators) {
      const result = validate(n);
      if (result.isLeft()) {
        errors.push(...result.value.errors);
      }
    }

    if (errors.length) {
      return left(ValidationError.from(...errors));
    }

    return right(true);
  };
}
