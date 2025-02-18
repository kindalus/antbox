import { Either, left, right } from "../../shared/either.ts";
import { ValidationError } from "../../shared/validation_error.ts";
import { Folders } from "../nodes/folders.ts";
import { Node } from "../nodes/node.ts";
import { NodeMetadata } from "../nodes/node_metadata.ts";
import { Nodes } from "../nodes/nodes.ts";
import { InvalidFullnameFormatError } from "./invalid_fullname_format_error.ts";

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
	}

	changeTitle(title: string): Either<ValidationError, void> {
		try {
			this.title = title;
			this.#validate();
			return right(undefined);
		} catch (err) {
			return left(err as ValidationError);
		}
	}

	#validate() {
		if (!this.title || this.title.length < 3) {
			throw ValidationError.from(new InvalidFullnameFormatError(this.title));
		}
	}
}
