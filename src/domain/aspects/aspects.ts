import { AspectNode, type AspectProperty } from "./aspect_node.ts";
import type { AspectableNode } from "domain/node_like.ts";
import { left, right } from "shared/either.ts";
import { ValidationError } from "shared/validation_error.ts";
import type { FileNode } from "domain/nodes/file_node.ts";
import type { MetaNode } from "domain/nodes/meta_node.ts";
import type { FolderNode } from "domain/nodes/folder_node.ts";
import { andSpecification, specificationFn, type Specification } from "shared/specification.ts";
import { PropertyRequiredError, PropertyTypeError } from "domain/nodes/property_errors.ts";

export class Aspects {
  static specificationFrom(aspect: AspectNode): Specification<AspectableNode> {
    const specs = aspect.properties.map((p) => Aspects.#propertySpecificationFrom(aspect, p));

    if (!specs.length) {
      return specificationFn((_n) => right(true));
    }

    if (specs.length === 1) {
      return specs[0];
    }

    const [s1, s2, ...sn] = specs;
    return andSpecification(s1, s2, ...sn);
  }

  static propertyName(aspect: AspectNode, property: AspectProperty): string {
    return `${aspect.uuid}:${property.name}`;
  }

  static #propertySpecificationFrom(
    aspect: AspectNode,
    property: AspectProperty,
  ): Specification<AspectableNode> {
    const name = Aspects.propertyName(aspect, property);
    return andSpecification(
      Aspects.#requiredSpecification(name, property),
      Aspects.#typeSpecification(name, property),
    );
  }

  static #requiredSpecification(
    propName: string,
    property: AspectProperty,
  ): Specification<FileNode | FolderNode | MetaNode> {
    return specificationFn((n) => {
      if (!property.required) {
        return right(true);
      }

      if (!n.properties[propName] && n.properties[propName] !== false) {
        return left(ValidationError.from(new PropertyRequiredError(property.title)));
      }
      return right(true);
    });
  }

  static #typeSpecification(
    propName: string,
    property: AspectProperty,
  ): Specification<AspectableNode> {
    return specificationFn((n) => {
      const value = n.properties[propName];
      const vtype = typeof value;
      const ptype = property.type;

      if (!value && value !== false) {
        return right(true);
      }

      if (["string", "boolean", "number"].includes(ptype)) {
        return ptype === vtype
          ? right(true)
          : left(ValidationError.from(new PropertyTypeError(property.title, property.type, ptype)));
      }

      switch (property.type) {
        case "string":
        case "number":
        case "boolean":
      }

      return right(true);
    });
  }

  private constructor() {}
}
