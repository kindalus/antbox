import { AntboxError } from "shared/antbox_error.ts";
import { Either, left, right } from "shared/either.ts";
import { ValidationError } from "shared/validation_error.ts";
import { Folders } from "domain/nodes/folders.ts";
import { Node } from "domain/nodes/node.ts";
import { NodeMetadata } from "domain/nodes/node_metadata.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { PropertyFormatError, PropertyRequiredError } from "domain/nodes/property_errors.ts";
import { z } from "zod";

const ApiKeyValidationSchema = z.object({
	group: z.string().min(1, "Node.group is required"),
	secret: z.string().min(1, "Node.secret is required"),
});

export class ApiKeyNode extends Node {
	protected _group: string;
	protected _secret: string;

	static create(
		metadata: Partial<NodeMetadata>,
	): Either<ValidationError, ApiKeyNode> {
		try {
			const node = new ApiKeyNode(metadata);

			return right(node);
		} catch (e) {
			return left(e as ValidationError);
		}
	}

	private constructor(metadata: Partial<NodeMetadata>) {
		super({
			...metadata,
			mimetype: Nodes.API_KEY_MIMETYPE,
			parent: Folders.API_KEYS_FOLDER_UUID,
			title: metadata.secret && metadata.secret.length > 0
				? metadata.secret.replace(/^(\w{4}).*$/g, "$1******")
				: metadata.title || "API Key",
		});

		this._group = metadata.group || "";
		this._secret = metadata.secret || "";

		this._validateApiKeyNode();
	}

	override update(
		metadata: Partial<NodeMetadata>,
	): Either<ValidationError, void> {
		const superUpdateResult = super.update({
			...metadata,
			parent: Folders.API_KEYS_FOLDER_UUID,
		});

		if (superUpdateResult.isLeft()) {
			return superUpdateResult;
		}

		this._group = metadata.group ?? this._group;
		this._secret = metadata.secret ?? this._secret;

		try {
			this._validateApiKeyNode();
		} catch (e) {
			return left(e as ValidationError);
		}

		return right(undefined);
	}

	override get metadata(): Partial<NodeMetadata> {
		return {
			...super.metadata,
			group: this._group,
			secret: this._secret,
		};
	}

	protected override _validateNode() {
		// Override to prevent base class validation before properties are set
		// Actual validation happens in _validateApiKeyNode
	}

	protected _validateApiKeyNode() {
		const errors: AntboxError[] = [];

		const nodeError = super._safeValidateNode();
		if (nodeError) {
			errors.push(...nodeError.errors);
		}

		const result = ApiKeyValidationSchema.safeParse({
			group: this._group,
			secret: this._secret,
		});

		if (!result.success) {
			for (const issue of result.error.issues) {
				const fieldName = issue.path.length > 0 ? String(issue.path[0]) : "unknown";

				if (issue.code === "too_small" && issue.minimum === 1) {
					errors.push(new PropertyRequiredError(`Node.${fieldName}`));
				} else {
					errors.push(
						new PropertyFormatError(
							`Node.${fieldName}`,
							"valid format",
							issue.message,
						),
					);
				}
			}
		}

		if (errors.length) {
			throw ValidationError.from(...errors);
		}
	}

	get group(): string {
		return this._group;
	}

	get secret(): string {
		return this._secret;
	}
}
