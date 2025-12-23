import { type Either, left, right } from "shared/either.ts";
import { ValidationError } from "shared/validation_error.ts";
import { Folders } from "domain/nodes/folders.ts";
import { Node } from "domain/nodes/node.ts";

import { type NodeMetadata } from "domain/nodes/node_metadata.ts";
import type { NodeFilters } from "domain/nodes/node_filter.ts";
import z from "zod";
import { AntboxError } from "shared/antbox_error.ts";
import { toPropertyError } from "../validation_schemas.ts";
import {
	PropertyDoesNotMatchRegexError,
	PropertyFormatError,
	PropertyNotInListError,
} from "../nodes/property_errors.ts";

const ASPECT_MIMETYPE = "application/vnd.antbox.aspect";
const AspectNodeValidationSchema = z.object({
	mimetype: z.literal(
		ASPECT_MIMETYPE,
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
			mimetype: ASPECT_MIMETYPE,
			parent: Folders.ASPECTS_FOLDER_UUID,
		});

		this._filters = metadata.filters ?? [];
		this._properties = (metadata.properties as AspectProperty[]) ?? [];

		this._validateAspectNode();
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
			mimetype: ASPECT_MIMETYPE,
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

	override get metadata(): NodeMetadata {
		return {
			...super.metadata,
			properties: this._properties,
			filters: this._filters,
		};
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

		// Validate properties
		const propertyErrors = this._validateProperties();
		if (propertyErrors.length > 0) {
			errors.push(...propertyErrors);
		}

		if (errors.length) {
			throw ValidationError.from(...errors);
		}
	}

	private _validateProperties(): AntboxError[] {
		const errors: AntboxError[] = [];

		for (const property of this._properties) {
			// Validate ValidationList constraints
			if (property.validationList) {
				if (
					property.type !== "string" &&
					!(property.type === "array" && property.arrayType === "string")
				) {
					errors.push(
						new PropertyFormatError(
							`AspectProperty.${property.name}.validationList`,
							"only allowed when type is 'string' or when type is 'array' and arrayType is 'string'",
							`type: ${property.type}, arrayType: ${property.arrayType}`,
						),
					);
				}
			}

			// Validate ValidationRegex constraints
			if (property.validationRegex) {
				if (
					property.type !== "string" &&
					!(property.type === "array" && property.arrayType === "string")
				) {
					errors.push(
						new PropertyFormatError(
							`AspectProperty.${property.name}.validationRegex`,
							"only allowed when type is 'string' or when type is 'array' and arrayType is 'string'",
							`type: ${property.type}, arrayType: ${property.arrayType}`,
						),
					);
				}
			}

			// Validate ValidationFilters constraints
			if (property.validationFilters) {
				if (
					property.type !== "uuid" &&
					!(property.type === "array" && property.arrayType === "uuid")
				) {
					errors.push(
						new PropertyFormatError(
							`AspectProperty.${property.name}.validationFilters`,
							"only allowed when type is 'uuid' or when type is 'array' and arrayType is 'uuid'",
							`type: ${property.type}, arrayType: ${property.arrayType}`,
						),
					);
				}
			}

			// Validate contentType constraints
			if (property.contentType) {
				if (property.type !== "string") {
					errors.push(
						new PropertyFormatError(
							`AspectProperty.${property.name}.contentType`,
							"only allowed when type is 'string'",
							`type: ${property.type}`,
						),
					);
				}
			}

			// Validate default value constraints
			if (property.default !== undefined) {
				const defaultErrors = this._validateDefaultValue(property);
				errors.push(...defaultErrors);
			}
		}

		return errors;
	}

	private _validateDefaultValue(property: AspectProperty): AntboxError[] {
		const errors: AntboxError[] = [];

		// Type validation
		if (!this._isValidTypeForDefault(property.default, property.type)) {
			errors.push(
				new PropertyFormatError(
					`AspectProperty.${property.name}.default`,
					`value of type ${property.type}`,
					`${typeof property.default}: ${property.default}`,
				),
			);
			return errors; // Don't continue if type is wrong
		}

		// For string type, validate against regex and list
		if (property.type === "string" && typeof property.default === "string") {
			if (property.validationRegex) {
				const regex = new RegExp(property.validationRegex);
				if (!regex.test(property.default)) {
					errors.push(
						new PropertyDoesNotMatchRegexError(
							`AspectProperty.${property.name}.default`,
							property.validationRegex,
							property.default,
						),
					);
				}
			}

			if (property.validationList) {
				if (!property.validationList.includes(property.default)) {
					errors.push(
						new PropertyNotInListError(
							`AspectProperty.${property.name}.default`,
							property.validationList,
							property.default,
						),
					);
				}
			}
		}

		return errors;
	}

	private _isValidTypeForDefault(
		value: unknown,
		expectedType: string,
	): boolean {
		switch (expectedType) {
			case "string":
				return typeof value === "string";
			case "number":
				return typeof value === "number";
			case "boolean":
				return typeof value === "boolean";
			case "uuid":
				return typeof value === "string"; // UUID is represented as string
			case "array":
				return Array.isArray(value);
			case "object":
				return typeof value === "object" && value !== null &&
					!Array.isArray(value);
			case "file":
				return typeof value === "string"; // File references are typically strings
			default:
				return false;
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
	arrayType?: "string" | "number" | "uuid";
	contentType?: string;

	readonly?: boolean;
	validationRegex?: string;
	validationList?: string[];
	validationFilters?: NodeFilters;
	required?: boolean;
	// TODO: Será realmente necessário? Quero implementar semantic search across all projects
	searchable?: boolean;
	default?: unknown;
}

export type AspectProperties = AspectProperty[];
