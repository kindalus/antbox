import { left, right } from "../../shared/either.ts";
import { ValidationError } from "../../shared/validation_error.ts";
import { NodeTitleRequiredError } from "./node_title_required_error.ts";
import { Node } from "./node.ts";
import { specFn, ValidationResult } from "../../shared/specification.ts";

export const NodeSpec = specFn(titleRequiredSpec);

function titleRequiredSpec(node: Node): ValidationResult {
	if (!node.title || node.title.length === 0) {
		return left(
			ValidationError.from(new NodeTitleRequiredError()),
		);
	}

	return right(true);
}
