import type { AspectData, AspectProperty } from "domain/configuration/aspect_data.ts";
import type { AspectableNode } from "domain/node_like.ts";
import { left, right } from "shared/either.ts";
import { ValidationError } from "shared/validation_error.ts";
import type { FileNode } from "domain/nodes/file_node.ts";
import type { MetaNode } from "domain/nodes/meta_node.ts";
import type { FolderNode } from "domain/nodes/folder_node.ts";
import { andSpecification, type Specification, specificationFn } from "shared/specification.ts";
import { uuid } from "domain/validation_schemas.ts";
import { z } from "zod";
import {
	PropertyDoesNotMatchRegexError,
	PropertyNotInListError,
	PropertyRequiredError,
	PropertyTypeError,
} from "domain/nodes/property_errors.ts";

export class Aspects {
	static specificationFrom(aspect: AspectData): Specification<AspectableNode> {
		const specs = aspect.properties.map((p: AspectProperty) =>
			Aspects.#propertySpecificationFrom(aspect, p)
		);

		if (!specs.length) {
			return specificationFn((_n) => right(true));
		}

		if (specs.length === 1) {
			return specs[0];
		}

		const [s1, s2, ...sn] = specs;
		return andSpecification(s1, s2, ...sn);
	}

	static propertyName(aspect: AspectData, property: AspectProperty): string {
		return `${aspect.uuid}:${property.name}`;
	}

	static #propertySpecificationFrom(
		aspect: AspectData,
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

			if (Aspects.#isMissingValue(n.properties[propName])) {
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
		const item = property.arrayType === "uuid"
			? uuid()
			: property.arrayType === "string"
			? z.string()
			: property.arrayType === "number"
			? z.number()
			: z.unknown();
		const schema = property.type === "uuid"
			? uuid()
			: property.type === "array"
			? z.array(item)
			: property.type === "date"
			? z.union([z.iso.date(), z.iso.datetime({ offset: true, local: true })])
			: property.type === "object"
			? z.record(z.string(), z.json())
			: undefined;
		return specificationFn((n) => {
			const value = n.properties[propName];
			const vtype = typeof value;
			const ptype = property.type;

			if (Aspects.#isMissingValue(value)) {
				return right(true);
			}

			if (["string", "boolean", "number"].includes(ptype)) {
				return ptype === vtype ? right(true) : left(
					ValidationError.from(
						new PropertyTypeError(property.title, property.type, vtype),
					),
				);
			}

			if (schema) {
				return schema.safeParse(value).success ? right(true) : left(
					ValidationError.from(
						new PropertyTypeError(
							property.title,
							ptype === "array" ? `${property.arrayType ?? "unknown"}[]` : ptype,
							vtype,
						),
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
			if (!property.validationList || !Aspects.#supportsValidationList(property)) {
				return right(true);
			}

			const value = n.properties[propName];
			if (Aspects.#isMissingValue(value)) {
				return right(true);
			}

			const list = property.validationList;
			const values = Array.isArray(value) ? value : [value];

			for (const v of values) {
				// Type validation reports incompatible values without invoking user-defined coercion.
				if (typeof v !== "string" && typeof v !== "number") continue;
				if (!list.includes(v as string | number)) {
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
			if (Aspects.#isMissingValue(value)) {
				return right(true);
			}

			const regex = new RegExp(property.validationRegex!);
			const values = Array.isArray(value) ? value : [value];

			for (const v of values) {
				if (typeof v !== "string") continue;
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

	static #supportsValidationList(property: AspectProperty): boolean {
		return property.type === "string" || property.type === "number" ||
			(property.type === "array" && property.arrayType === "string");
	}

	static #isMissingValue(value: unknown): boolean {
		return value === undefined || value === null || value === "";
	}

	private constructor() {}
}
