import { Either, left, right } from "../../shared/either.ts";
import { ValidationError } from "../../shared/validation_error.ts";
import { Folders } from "../nodes/folders.ts";
import { FileNodeMixin } from "../nodes/mixins.ts";
import { Node } from "../nodes/node.ts";
import { NodeFilter } from "../nodes/node_filter.ts";
import { NodeMetadata } from "../nodes/node_metadata.ts";
import { Nodes } from "../nodes/nodes.ts";

export class ActionNode extends FileNodeMixin(Node) {
	static create(
		metadata: Partial<NodeMetadata>,
	): Either<ValidationError, ActionNode> {
		try {
			const node = new ActionNode(metadata);
			return right(node);
		} catch (e) {
			return left(e as ValidationError);
		}
	}

	runOnCreates: boolean;
	runOnUpdates: boolean;
	runManually: boolean;
	runAs?: string;
	params: string[];
	filters: NodeFilter[];
	groupsAllowed: string[];

	private constructor(metadata: Partial<NodeMetadata> = {}) {
		super({
			...metadata,
			mimetype: Nodes.ACTION_MIMETYPE,
			parent: Folders.ACTIONS_FOLDER_UUID,
		});

		this.runOnCreates = metadata.runOnCreates ?? false;
		this.runOnUpdates = metadata.runOnUpdates ?? false;
		this.runManually = metadata.runManually ?? true;
		this.runAs = metadata.runAs;
		this.params = metadata.params ?? [];
		this.filters = metadata.filters ?? [];
		this.groupsAllowed = metadata.groupsAllowed ?? [];
	}
}
