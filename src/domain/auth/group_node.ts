import { Either, left, right } from "../../shared/either.ts";
import { ValidationError } from "../../shared/validation_error.ts";
import { Folders } from "../nodes/folders.ts";
import { Node } from "../nodes/node.ts";
import { NodeMetadata } from "../nodes/node_metadata.ts";
import { Nodes } from "../nodes/nodes.ts";
import { InvalidFullNameFormatError } from "./invalid_fullname_format_error.ts";

export class GroupNode extends Node {
	static create(metadata: Partial<NodeMetadata>): Either<ValidationError, GroupNode> {
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

		this.#validate()
	}

	override update(metadata: Partial<NodeMetadata>): Either<ValidationError, void> {
		const superUpdateResult = super.update({...metadata, parent: Folders.GROUPS_FOLDER_UUID})

		if(superUpdateResult.isLeft()) {
			return superUpdateResult
		}

		try {
			this.#validate()

			return right(undefined)
		}catch(e) {
			return left(e as ValidationError)
		}
	}

	#validate() {
		if (!this.title || this.title.length < 3) {
			throw ValidationError.from(new InvalidFullNameFormatError(this.title));
		}
	}
}
