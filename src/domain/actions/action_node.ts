import { Node } from "../nodes/node.ts";
import { NodeFilter } from "../nodes/node_filter.ts";

export class ActionNode extends Node {
	runOnCreates: boolean;
	runOnUpdates: boolean;
	runManually: boolean;
	runAs?: string;
	params: string[];
	filters: NodeFilter[];

	constructor() {
		super();
		this.runOnCreates = false;
		this.runOnUpdates = false;
		this.runManually = true;
		this.params = [];
		this.filters = [];

		this.mimetype = Node.ACTION_MIMETYPE;
		this.parent = Node.ACTIONS_FOLDER_UUID;
	}
}
