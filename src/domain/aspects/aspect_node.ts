import { Either, left, right } from "../../shared/either.ts";
import { ValidationError } from "../../shared/validation_error.ts";
import { Folders } from "../nodes/folders.ts";
import { Node } from "../nodes/node.ts";
import { NodeFilter } from "../nodes/node_filter.ts";
import { NodeMetadata } from "../nodes/node_metadata.ts";
import { Nodes } from "../nodes/nodes.ts";
import { AspectProperty } from "./aspect.ts";
import { AspectSpec } from "./aspect_spec.ts";

export class AspectNode extends Node {
	static create(metadata: Partial<NodeMetadata>): Either<ValidationError, AspectNode> {
		const node = new AspectNode(metadata);

		const trueOrErr = AspectSpec.isSatisfiedBy(node);

		if (trueOrErr.isLeft()) {
			return left(trueOrErr.value);
		}

		return right(node);
	}

	filters: NodeFilter[];
	properties: AspectProperty[];

	private constructor(metadata: Partial<NodeMetadata> = {}) {
		super({
			...metadata,
			mimetype: Nodes.ASPECT_MIMETYPE,
			parent: Folders.ASPECTS_FOLDER_UUID,
		});

		this.filters = metadata.filters ?? [];
		this.properties = (metadata.properties as AspectProperty[]) ?? [];
	}
}
