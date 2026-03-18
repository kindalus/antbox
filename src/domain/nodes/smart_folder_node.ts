import { Nodes } from "./nodes.ts";
import { type NodeMetadata } from "./node_metadata.ts";
import { Node } from "./node.ts";
import { type NodeFilters } from "./node_filter.ts";
import { type Either, left, right } from "shared/either.ts";
import { ValidationError } from "shared/validation_error.ts";
import { PropertyRequiredError } from "./property_errors.ts";
import { AntboxError } from "shared/antbox_error.ts";
import { z } from "zod";
import { toPropertyError } from "../validation_schemas.ts";
import { NodesFilters } from "../nodes_filters.ts";

const SmartFolderValidationSchema = z.object({
	filters: z.array(z.any()).min(1, "SmartFolder.filters is required"),
});

export class SmartFolderNode extends Node {
	static create(
		metadata: Partial<NodeMetadata> = {},
	): Either<ValidationError, SmartFolderNode> {
		try {
			return right(new SmartFolderNode(metadata));
		} catch (err) {
			return left(err as ValidationError);
		}
	}

	protected _filters: NodeFilters = undefined as unknown as NodeFilters;

	constructor(metadata: Partial<NodeMetadata> = {}) {
		super({ ...metadata, mimetype: Nodes.SMART_FOLDER_MIMETYPE });

		this._filters = SmartFolderNode.#resolveFilters(metadata.filters);

		this._validateSmartFolderNode();
	}

	get filters(): NodeFilters {
		return this._filters;
	}

	override update(
		metadata: Partial<NodeMetadata>,
	): Either<ValidationError, void> {
		try {
			if (metadata.filters !== undefined) {
				const resolved = SmartFolderNode.#resolveFilters(metadata.filters);
				if (!resolved?.length) {
					return left(ValidationError.from(new PropertyRequiredError("filters")));
				}
				this._filters = resolved;
			}

			return super.update(metadata);
		} catch (err) {
			return left(err as ValidationError);
		}
	}

	override get metadata(): NodeMetadata {
		return {
			...super.metadata,
			filters: this._filters,
		};
	}

	static #resolveFilters(
		filters: NodeFilters | string | undefined,
	): NodeFilters {
		if (typeof filters !== "string") {
			return filters ?? [];
		}

		const filtersOrErr = NodesFilters.parse(filters);

		if (filtersOrErr.isLeft()) {
			return [["fulltext", "match", filters]];
		}

		return filtersOrErr.value;
	}

	protected _validateSmartFolderNode() {
		const superError: ValidationError | undefined = super._safeValidateNode();
		const errors: AntboxError[] = [];

		if (superError) {
			errors.push(...superError.errors);
		}

		const result = SmartFolderValidationSchema.safeParse(this.metadata);

		if (!result.success) {
			errors.push(
				...result.error.issues.map(toPropertyError("SmartFolderNode")),
			);
		}

		if (errors.length) {
			throw ValidationError.from(...errors);
		}
	}
}
