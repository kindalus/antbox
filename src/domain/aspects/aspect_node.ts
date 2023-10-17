import { Node } from "../nodes/node.ts";
import { NodeFilter } from "../nodes/node_filter.ts";
import { AspectProperty } from "./aspect.ts";

export class AspectNode extends Node {
	filters: NodeFilter[];
	aspectProperties: AspectProperty[];

	constructor() {
		super();
		this.filters = [];
		this.aspectProperties = [];
		this.mimetype = Node.ASPECT_MIMETYPE;
		this.parent = Node.ASPECTS_FOLDER_UUID;
	}
}
