import { AspectNode, type AspectProperty } from "./aspect_node.ts";
import type { AspectableNode } from "domain/node_like.ts";
import { left, right } from "shared/either.ts";
import { ValidationError } from "shared/validation_error.ts";
import type { FileNode } from "domain/nodes/file_node.ts";
import type { MetaNode } from "domain/nodes/meta_node.ts";
import type { FolderNode } from "domain/nodes/folder_node.ts";
import { andSpecification, type Specification, specificationFn } from "shared/specification.ts";
import {
	PropertyDoesNotMatchRegexError,
	PropertyNotInListError,
	PropertyRequiredError,
	PropertyTypeError,
} from "domain/nodes/property_errors.ts";

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
			Aspects.#validationListSpecification(name, property),
			Aspects.#validationRegexSpecification(name, property),
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
				return left(
					ValidationError.from(new PropertyRequiredError(property.title)),
				);
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
			const atype = property.arrayType;

			if (!value && value !== false) {
				return right(true);
			}

			if (["string", "boolean", "number"].includes(ptype)) {
				return ptype === vtype ? right(true) : left(
					ValidationError.from(
						new PropertyTypeError(property.title, property.type, vtype),
					),
				);
			}

			if (ptype === "array" && atype === "string" && Array.isArray(value)) {
				return value.every((v) => typeof v === "string") ? right(true) : left(
					ValidationError.from(
						new PropertyTypeError(property.title, property.type, "string[]"),
					),
				);
			}

			return right(true);
		});
	}

	static #validationListSpecification(
		propName: string,
		property: AspectProperty,
	): Specification<AspectableNode> {
		return specificationFn((n) => {
			if (
				!property.validationList ||
				!(property.type === "string" ||
					(property.type === "array" && property.arrayType === "string"))
			) {
				return right(true);
			}

			const value = n.properties[propName];
			if (!value) {
				return right(true);
			}

			const list = property.validationList!;
			const values = Array.isArray(value) ? value : [value];

			for (const v of values) {
				if (!list.includes(v)) {
					return left(
						ValidationError.from(
							new PropertyNotInListError(property.title, list, v),
						),
					);
				}
			}

			return right(true);
		});
	}

	static #validationRegexSpecification(
		propName: string,
		property: AspectProperty,
	): Specification<AspectableNode> {
		return specificationFn((n) => {
			if (
				!property.validationRegex ||
				!(property.type === "string" ||
					(property.type === "array" && property.arrayType === "string"))
			) {
				return right(true);
			}

			const value = n.properties[propName];
			if (!value) {
				return right(true);
			}

			const regex = new RegExp(property.validationRegex!);
			const values = Array.isArray(value) ? value : [value];

			for (const v of values) {
				if (!regex.test(v)) {
					return left(
						ValidationError.from(
							new PropertyDoesNotMatchRegexError(
								property.title,
								property.validationRegex!,
								v,
							),
						),
					);
				}
			}

			return right(true);
		});
	}

	private constructor() {}
}
