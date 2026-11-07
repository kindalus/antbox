import type { AspectData, AspectProperty } from "domain/configuration/aspect_data.ts";
import type { AspectableNode } from "domain/node_like.ts";
import type { AntboxError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import { ValidationError } from "shared/validation_error.ts";
import { andSpecification, type Specification, specificationFn } from "shared/specification.ts";
import { uuid } from "domain/validation_schemas.ts";
import { z } from "zod";
import {
	PropertyDoesNotMatchRegexError,
	PropertyInvalidRegexError,
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

	/**
	 * Checks one value against the property's type, `validationList` and `validationRegex`, the rules
	 * shared by node values and `defaultValue`. Missing values (`undefined`, `null`, `""`) pass;
	 * `required` and uuid references are checked elsewhere.
	 */
	static validateValue(property: AspectProperty, value: unknown): Either<ValidationError, true> {
		const errors = [
			Aspects.#checkType(property, value),
			Aspects.#checkValidationList(property, value),
			Aspects.#checkValidationRegex(property, value),
		].filter((error): error is AntboxError => error !== undefined);

		return errors.length ? left(ValidationError.from(...errors)) : right(true);
	}

	/**
	 * True when the value means "no value" for the property: `undefined`, `null`, or an empty string
	 * in a property whose type is not `string`.
	 */
	static isEmptyValue(property: AspectProperty, value: unknown): boolean {
		return value === undefined || value === null || (value === "" && property.type !== "string");
	}

	/** The reason a `validationRegex` does not compile as a JavaScript RegExp, if it does not. */
	static regexError(pattern: string): string | undefined {
		try {
			new RegExp(pattern);
			return undefined;
		} catch (error) {
			return error instanceof Error ? error.message : String(error);
		}
	}

	static #propertySpecificationFrom(
		aspect: AspectData,
		property: AspectProperty,
	): Specification<AspectableNode> {
		const name = Aspects.propertyName(aspect, property);
		return specificationFn((n) => {
			const value = n.properties[name];
			if (property.required && Aspects.#isMissingValue(value)) {
				return left(ValidationError.from(new PropertyRequiredError(property.title)));
			}

			return Aspects.validateValue(property, value);
		});
	}

	static #checkType(property: AspectProperty, value: unknown): AntboxError | undefined {
		if (Aspects.#isMissingValue(value)) {
			return undefined;
		}

		const vtype = typeof value;
		const ptype = property.type;

		if (ptype === "string" || ptype === "boolean" || ptype === "number") {
			return ptype === vtype ? undefined : new PropertyTypeError(property.title, ptype, vtype);
		}

		const schema = Aspects.#typeSchema(property);
		if (!schema || schema.safeParse(value).success) {
			return undefined;
		}

		return new PropertyTypeError(
			property.title,
			ptype === "array" ? `${property.arrayType ?? "unknown"}[]` : ptype,
			vtype,
		);
	}

	static #typeSchema(property: AspectProperty): z.ZodType | undefined {
		const item = property.arrayType === "uuid"
			? uuid()
			: property.arrayType === "string"
			? z.string()
			: property.arrayType === "number"
			? z.number()
			: z.unknown();
		return property.type === "uuid"
			? uuid()
			: property.type === "array"
			? z.array(item)
			: property.type === "date"
			? z.union([z.iso.date(), z.iso.datetime({ offset: true, local: true })])
			: property.type === "object"
			? z.record(z.string(), z.json())
			: undefined;
	}

	static #checkValidationList(property: AspectProperty, value: unknown): AntboxError | undefined {
		if (
			!property.validationList || !Aspects.#supportsValidationList(property) ||
			Aspects.#isMissingValue(value)
		) {
			return undefined;
		}

		const list = property.validationList;
		const values = Array.isArray(value) ? value : [value];

		for (const v of values) {
			// Type validation reports incompatible values without invoking user-defined coercion.
			if (typeof v !== "string" && typeof v !== "number") continue;
			if (!list.includes(v as string | number)) {
				return new PropertyNotInListError(property.title, list, v);
			}
		}

		return undefined;
	}

	static #checkValidationRegex(property: AspectProperty, value: unknown): AntboxError | undefined {
		if (
			!property.validationRegex ||
			!(property.type === "string" ||
				(property.type === "array" && property.arrayType === "string")) ||
			Aspects.#isMissingValue(value)
		) {
			return undefined;
		}

		// Aspects saved before uploads checked the pattern may hold one that does not compile.
		const regexError = Aspects.regexError(property.validationRegex);
		if (regexError) {
			return new PropertyInvalidRegexError(property.title, property.validationRegex, regexError);
		}

		const regex = new RegExp(property.validationRegex);
		const values = Array.isArray(value) ? value : [value];
		for (const v of values) {
			if (typeof v !== "string") continue;
			if (!regex.test(v)) {
				return new PropertyDoesNotMatchRegexError(property.title, property.validationRegex, v);
			}
		}

		return undefined;
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
