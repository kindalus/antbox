import { type Either, left, right } from "../../shared/either.ts";
import { ValidationError } from "../../shared/validation_error.ts";
import { Folders } from "../nodes/folders.ts";
import { Node } from "../nodes/node.ts";
import { type NodeFilter } from "../nodes/node_filter.ts";
import { type NodeMetadata } from "../nodes/node_metadata.ts";
import { Nodes } from "../nodes/nodes.ts";
import { type AspectProperty } from "./aspect.ts";

export class AspectNode extends Node {
	static create(metadata: Partial<NodeMetadata>): Either<ValidationError, AspectNode> {
		try {
			const node = new AspectNode(metadata);
			return right(node);
		} catch (e) {
			return left(e as ValidationError);
		}
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
