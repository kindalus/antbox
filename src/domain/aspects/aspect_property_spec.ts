import { AntboxError } from "../../shared/antbox_error.ts";
import { left, right } from "../../shared/either.ts";
import { specFn, Specification } from "../../shared/specification.ts";
import { ValidationError } from "../../shared/validation_error.ts";
import { AspectProperty } from "./aspect.ts";

function propertyTypeSpec<T>(p: AspectProperty): Specification<T> {
	return specFn((t: T) => {
		const err = ValidationError.from(new PropertyTypeError(p.name, p.type));

		if (t === null || t === undefined || typeof t === "undefined") {
			return right(true);
		}

		if (p.type.endsWith("[]") && !Array.isArray(t)) return left(err);

		if (p.type.endsWith("[]") && (t as []).length === 0) return right(true);

		const t1 = p.type.endsWith("[]") ? (t as T[])[0] : t;
		const p1 = p.type.endsWith("[]") ? p.type.slice(0, -2) : p.type;

		switch (p1) {
			case "string":
			case "uuid":
				if (typeof t1 !== "string") return left(err);
				return right(true);
			case "number":
				if (typeof t1 !== "number") return left(err);
				return right(true);
			case "boolean":
				if (typeof t1 !== "boolean") return left(err);
				return right(true);
			case "dateTime":
				if (typeof t1 !== "string") return left(err);
				if (!t1.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/)) {
					return left(err);
				}
				return right(true);
		}

		return right(true);
	});
}

function requiredSpec<T>(p: AspectProperty): Specification<T> {
	return specFn((t: T) => {
		if (t === undefined || t === null) {
			return left(ValidationError.from(new RequiredPropertyError(p.name)));
		}

		if (Array.isArray(t) && t.length === 0) {
			return left(ValidationError.from(new RequiredPropertyError(p.name)));
		}

		return right(true);
	});
}

function readonlySpec<T>(p: AspectProperty): Specification<T> {
	return specFn((t: T) => {
		if (t) {
			return left(ValidationError.from(new ReadonlyPropertyError(p.name)));
		}

		return right(true);
	});
}

export class RequiredPropertyError extends AntboxError {
	static readonly ERROR_CODE = "RequiredProperty";
	constructor(public readonly property: string) {
		super(RequiredPropertyError.ERROR_CODE, property);
	}
}

export class ReadonlyPropertyError extends AntboxError {
	static readonly ERROR_CODE = "ReadonlyProperty";
	constructor(public readonly property: string) {
		super(ReadonlyPropertyError.ERROR_CODE, property);
	}
}

export class PropertyTypeError extends AntboxError {
	static readonly ERROR_CODE = "PropertyType";
	constructor(public readonly property: string, public readonly type: string) {
		super(PropertyTypeError.ERROR_CODE, type);
	}
}

export function buildAspectPropertySpec<T>(
	p: AspectProperty,
): Specification<T> {
	const specs = [propertyTypeSpec(p)];

	if (p.required) specs.push(requiredSpec(p));

	if (p.readonly) specs.push(readonlySpec(p));

	return specs.reduce((acc, spec) => acc.and(spec));
}
