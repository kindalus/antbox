import { type Either, left, right } from "shared/either.ts";
import { ValidationError } from "shared/validation_error.ts";
import { Node } from "domain/nodes/node.ts";
import { type NodeMetadata } from "domain/nodes/node_metadata.ts";
import { FolderMixin } from "domain/nodes/folder_mixin.ts";
import { WithAspectMixin } from "domain/nodes/with_aspect_mixin.ts";
import { AntboxError } from "shared/antbox_error.ts";

export class FolderNode extends FolderMixin(WithAspectMixin(Node)) {
	static create(
		metadata: Partial<NodeMetadata>,
	): Either<ValidationError, FolderNode> {
		try {
			return right(new FolderNode(metadata));
		} catch (err) {
			return left(err as ValidationError);
		}
	}

	private constructor(metadata: Partial<NodeMetadata>) {
		super(metadata);

		this._validateFolderNode();
	}

	protected _validateFolderNode(): void {
		const errors: AntboxError[] = [];
		const folderMixinError = super._safeValidateFolderMixin();
		const nodeError = super._safeValidateNode();

		if (nodeError) {
			errors.push(...nodeError.errors);
		}

		if (folderMixinError) {
			errors.push(...folderMixinError.errors);
		}

		if (errors.length) {
			throw ValidationError.from(...errors);
		}
	}
}
