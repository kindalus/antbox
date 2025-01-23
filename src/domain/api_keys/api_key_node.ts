import { Either, right } from "../../shared/either.ts";
import { ValidationError } from "../../shared/validation_error.ts";
import { Node } from "../nodes/node.ts";
import { NodeMetadata } from "../nodes/node_metadata.ts";
import { Nodes } from "../nodes/nodes.ts";

export class ApiKeyNode extends Node {
	static create(metadata: Partial<NodeMetadata>): Either<ValidationError, ApiKeyNode> {
		const node = new ApiKeyNode(metadata.group, metadata.secret, metadata.description);

		return right(node);
	}

	group: string = null as unknown as string;
	secret: string = null as unknown as string;

	private constructor(group = "", secret = "", description = "") {
		super(
			{
				description,
				mimetype: Nodes.API_KEY_MIMETYPE,
				parent: Nodes.API_KEYS_FOLDER_UUID,
				title: secret.replace(/^(\w{4}).*$/g, "$1******"),
			},
		);

		this.group = group;
		this.secret = secret;
	}

	override isApikey(): this is ApiKeyNode {
		return true;
	}

	cloneWithSecret(): ApiKeyNode {
		return new ApiKeyNode(this.group, this.secret, this.description);
	}
}
