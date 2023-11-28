import { Either, left, right } from "../../shared/either.ts";
import { ValidationError } from "../../shared/validation_error.ts";
import { NodeFilter } from "../nodes/node_filter.ts";
import { ActionNodeSpec } from "./action_node_spec.ts";
import { ActionNode } from "./action_node.ts";

export class ActionNodeBuilder {
	private readonly actionNode: ActionNode;

	constructor() {
		this.actionNode = Object.create(ActionNode.prototype);
	}

	withUuid(uuid: string): ActionNodeBuilder {
		Object.assign(this.actionNode, { uuid });
		return this;
	}

	withTitle(title: string): ActionNodeBuilder {
		Object.assign(this.actionNode, { title });
		return this;
	}

	withDescription(description: string): ActionNodeBuilder {
		Object.assign(this.actionNode, { description });
		return this;
	}

	withRunOnCreates(runOnCreates: boolean): ActionNodeBuilder {
		Object.assign(this.actionNode, { runOnCreates });
		return this;
	}

	withRunOnUpdates(runOnUpdates: boolean): ActionNodeBuilder {
		Object.assign(this.actionNode, { runOnUpdates });
		return this;
	}

	withRunManually(runManually: boolean): ActionNodeBuilder {
		Object.assign(this.actionNode, { runManually });
		return this;
	}

	withRunAs(runAs: string): ActionNodeBuilder {
		Object.assign(this.actionNode, { runAs });
		return this;
	}

	withParams(params: string[]): ActionNodeBuilder {
		Object.assign(this.actionNode, { params });
		return this;
	}

	withFilters(filters: NodeFilter[]): ActionNodeBuilder {
		Object.assign(this.actionNode, { filters });
		return this;
	}

	withGroupsAllowed(groupsAllowed: string[]): ActionNodeBuilder {
		Object.assign(this.actionNode, { groupsAllowed });
		return this;
	}

	build(): Either<ValidationError, ActionNode> {
		const trueOrrErr = ActionNodeSpec.isSatisfiedBy(this.actionNode);

		if (trueOrrErr.isLeft()) {
			return left(trueOrrErr.value);
		}

		return right(this.actionNode);
	}
}
