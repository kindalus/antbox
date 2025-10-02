import { type Either, left, right } from "shared/either.ts";
import { ValidationError } from "shared/validation_error.ts";
import { Folders } from "domain/nodes/folders.ts";
import { Node } from "domain/nodes/node.ts";
import { type NodeMetadata } from "domain/nodes/node_metadata.ts";
import { Nodes } from "domain/nodes/nodes.ts";

export class GroupNode extends Node {
	static create(
		metadata: Partial<NodeMetadata>,
	): Either<ValidationError, GroupNode> {
		try {
			const group = new GroupNode(metadata);

			return right(group);
		} catch (err) {
			return left(err as ValidationError);
		}
	}

	constructor(metadata: Partial<NodeMetadata> = {}) {
		super({
			...metadata,
			mimetype: Nodes.GROUP_MIMETYPE,
			parent: Folders.GROUPS_FOLDER_UUID,
		});

		this._validateNode();
	}

	override update(
		metadata: Partial<NodeMetadata>,
	): Either<ValidationError, void> {
		const superUpdateResult = super.update({
			...metadata,
			parent: Folders.GROUPS_FOLDER_UUID,
		});

		if (superUpdateResult.isLeft()) {
			return superUpdateResult;
		}

		try {
			this._validateNode();

			return right(undefined);
		} catch (e) {
			return left(e as ValidationError);
		}
	}
}
