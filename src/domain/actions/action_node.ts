import { Node } from "../nodes/node.ts";
import { NodeFilter } from "../nodes/node_filter.ts";

export class ActionNode extends Node {
	readonly runOnCreates: boolean;
	readonly runOnUpdates: boolean;
	readonly runManually: boolean;
	readonly runAs?: string;
	readonly params: string[];
	readonly filters: NodeFilter[];
	readonly groupsAllowed: string[];

	constructor() {
		super();

		this.runOnCreates = false;
		this.runOnUpdates = false;
		this.runManually = true;
		this.params = [];
		this.filters = [];
		this.groupsAllowed = [];

		this.mimetype = Node.ACTION_MIMETYPE;
		this.parent = Node.ACTIONS_FOLDER_UUID;
	}
}
