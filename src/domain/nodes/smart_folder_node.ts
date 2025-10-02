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

const SmartFolderValidationSchema = z.object({
	filters: z.array(z.any()).min(1, "SmartFolder.filters is required"),
});

export class SmartFolderNode extends Node {
	static create(
		metadata: Partial<SmartFolderNode> = {},
	): Either<ValidationError, SmartFolderNode> {
		try {
			return right(new SmartFolderNode(metadata));
		} catch (err) {
			return left(err as ValidationError);
		}
	}

	protected _filters: NodeFilters;

	constructor(metadata: Partial<NodeMetadata> = {}) {
		super({ ...metadata, mimetype: Nodes.SMART_FOLDER_MIMETYPE });

		this._filters = metadata.filters ?? [];

		this._validateSmartFolderNode();
	}

	get filters(): NodeFilters {
		return this._filters;
	}

	override update(
		metadata: Partial<NodeMetadata>,
	): Either<ValidationError, void> {
		try {
			if (!metadata.filters?.length) {
				return left(ValidationError.from(new PropertyRequiredError("filters")));
			}
			this._filters = metadata.filters!;

			return super.update(metadata);
		} catch (err) {
			return left(err as ValidationError);
		}
	}

	override get metadata(): Partial<NodeMetadata> {
		return {
			...super.metadata,
			filters: this._filters,
		};
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
