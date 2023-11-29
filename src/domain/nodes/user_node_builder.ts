import { Either, left, right } from "../../shared/either.ts";
import { ValidationError } from "../../shared/validation_error.ts";
import { UserSpec } from "../auth/user_spec.ts";
import { UserNode } from "./user_node.ts";

export class UserNodeBuilder {
	private readonly node: UserNode;

	constructor() {
		this.node = new UserNode();
	}

	withUuid(uuid: string): UserNodeBuilder {
		Object.assign(this.node, { uuid });
		return this;
	}

	withTitle(title: string): UserNodeBuilder {
		Object.assign(this.node, { title });
		return this;
	}

	withEmail(email: string): UserNodeBuilder {
		Object.assign(this.node, { email });
		return this;
	}

	withGroup(group: string): UserNodeBuilder {
		Object.assign(this.node, { group });
		return this;
	}

	withGroups(groups: string[]): UserNodeBuilder {
		Object.assign(this.node, { groups });
		return this;
	}

	withOwner(owner: string): UserNodeBuilder {
		Object.assign(this.node, { owner });
		return this;
	}

	build(): Either<ValidationError, UserNode> {
		const trueOrErr = UserSpec.isSatisfiedBy(this.node as UserNode);

		if (trueOrErr.isLeft()) {
			return left(trueOrErr.value);
		}

		return right(this.node);
	}
}
