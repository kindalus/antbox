import type { FeatureParameter } from "domain/configuration/feature_data.ts";
import { type AntboxError, BadRequestError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";

export function validateFeatureParameters(
	parameterDefs: FeatureParameter[] | undefined,
	providedParams: Record<string, unknown>,
): Either<AntboxError, Record<string, unknown>> {
	if (!parameterDefs?.length) {
		return right(providedParams);
	}

	const normalizedParams: Record<string, unknown> = { ...providedParams };

	for (const parameter of parameterDefs) {
		const hasValue = parameter.name in normalizedParams;
		const rawValue = normalizedParams[parameter.name];

		if (!hasValue || rawValue === undefined || rawValue === null || rawValue === "") {
			if (parameter.defaultValue !== undefined) {
				normalizedParams[parameter.name] = parameter.defaultValue;
				continue;
			}

			if (parameter.required) {
				return left(
					new BadRequestError(`Required parameter '${parameter.name}' is missing`),
				);
			}

			delete normalizedParams[parameter.name];
			continue;
		}

		const valueOrErr = coerceParameterValue(parameter, rawValue);
		if (valueOrErr.isLeft()) {
			return left(valueOrErr.value);
		}

		normalizedParams[parameter.name] = valueOrErr.value;
	}

	return right(normalizedParams);
}

function coerceParameterValue(
	parameter: FeatureParameter,
	value: unknown,
): Either<AntboxError, unknown> {
	switch (parameter.type) {
		case "string":
			return typeof value === "string"
				? right(value)
				: left(new BadRequestError(`Parameter '${parameter.name}' must be a string`));
		case "number": {
			const parsed = typeof value === "number"
				? value
				: typeof value === "string" && value.trim().length > 0
				? Number(value)
				: Number.NaN;
			return Number.isFinite(parsed)
				? right(parsed)
				: left(new BadRequestError(`Parameter '${parameter.name}' must be a number`));
		}
		case "boolean": {
			if (typeof value === "boolean") {
				return right(value);
			}

			if (typeof value === "string") {
				const normalized = value.trim().toLowerCase();
				if (["true", "1", "yes", "y"].includes(normalized)) {
					return right(true);
				}
				if (["false", "0", "no", "n"].includes(normalized)) {
					return right(false);
				}
			}

			return left(new BadRequestError(`Parameter '${parameter.name}' must be a boolean`));
		}
		case "date": {
			if (typeof value !== "string") {
				return left(
					new BadRequestError(`Parameter '${parameter.name}' must be an ISO date string`),
				);
			}

			const parsed = new Date(value);
			return Number.isNaN(parsed.getTime())
				? left(
					new BadRequestError(
						`Parameter '${parameter.name}' must be a valid ISO date string`,
					),
				)
				: right(parsed.toISOString());
		}
		case "object": {
			if (isPlainObject(value)) {
				return right(value);
			}

			if (typeof value === "string") {
				try {
					const parsed = JSON.parse(value);
					return isPlainObject(parsed)
						? right(parsed)
						: left(new BadRequestError(`Parameter '${parameter.name}' must be an object`));
				} catch {
					return left(
						new BadRequestError(`Parameter '${parameter.name}' must be valid JSON object`),
					);
				}
			}

			return left(new BadRequestError(`Parameter '${parameter.name}' must be an object`));
		}
		case "file": {
			if (!(value instanceof File)) {
				return left(new BadRequestError(`Parameter '${parameter.name}' must be a file`));
			}

			if (parameter.contentType && value.type !== parameter.contentType) {
				return left(
					new BadRequestError(
						`Parameter '${parameter.name}' must have content type '${parameter.contentType}'`,
					),
				);
			}

			return right(value);
		}
		case "array":
			return coerceArrayParameterValue(parameter, value);
	}
}

function coerceArrayParameterValue(
	parameter: FeatureParameter,
	value: unknown,
): Either<AntboxError, unknown[]> {
	let values: unknown[];

	if (Array.isArray(value)) {
		values = value;
	} else if (typeof value === "string") {
		try {
			const parsed = JSON.parse(value);
			values = Array.isArray(parsed) ? parsed : splitArray(value);
		} catch {
			values = splitArray(value);
		}
	} else {
		return left(new BadRequestError(`Parameter '${parameter.name}' must be an array`));
	}

	const coerced: unknown[] = [];
	for (const item of values) {
		const itemOrErr = coerceArrayItem(parameter, item);
		if (itemOrErr.isLeft()) {
			return left(itemOrErr.value);
		}

		coerced.push(itemOrErr.value);
	}

	return right(coerced);
}

function splitArray(value: string): string[] {
	return value.split(",").map((entry) => entry.trim()).filter(Boolean);
}

function coerceArrayItem(
	parameter: FeatureParameter,
	value: unknown,
): Either<AntboxError, unknown> {
	switch (parameter.arrayType) {
		case "number": {
			const parsed = typeof value === "number"
				? value
				: typeof value === "string" && value.trim().length > 0
				? Number(value)
				: Number.NaN;
			return Number.isFinite(parsed) ? right(parsed) : left(
				new BadRequestError(`Parameter '${parameter.name}' must contain only numbers`),
			);
		}
		case "object": {
			if (isPlainObject(value)) {
				return right(value);
			}

			if (typeof value === "string") {
				try {
					const parsed = JSON.parse(value);
					return isPlainObject(parsed) ? right(parsed) : left(
						new BadRequestError(`Parameter '${parameter.name}' must contain only objects`),
					);
				} catch {
					return left(
						new BadRequestError(`Parameter '${parameter.name}' must contain only objects`),
					);
				}
			}

			return left(
				new BadRequestError(`Parameter '${parameter.name}' must contain only objects`),
			);
		}
		case "file": {
			if (!(value instanceof File)) {
				return left(
					new BadRequestError(`Parameter '${parameter.name}' must contain only files`),
				);
			}

			if (parameter.contentType && value.type !== parameter.contentType) {
				return left(
					new BadRequestError(
						`Parameter '${parameter.name}' files must have content type '${parameter.contentType}'`,
					),
				);
			}

			return right(value);
		}
		case "string":
		case undefined:
			return typeof value === "string" ? right(value) : left(
				new BadRequestError(`Parameter '${parameter.name}' must contain only strings`),
			);
	}
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value) &&
		!(value instanceof File);
}
