import { left, right } from "../../shared/either.ts";
import { andSpecification, specFn, ValidationResult } from "../../shared/specification.ts";
import { ValidationError } from "../../shared/validation_error.ts";
import { NodeSpec } from "../nodes/node_spec.ts";
import { AspectNode } from "./aspect_node.ts";
import { CannotHaveAspectsError } from "./cannot_have_aspects_error.ts";

export const AspectSpec = andSpecification<AspectNode>(
	NodeSpec,
	specFn(cannotHaveAspectsSpect),
);

function cannotHaveAspectsSpect(node: AspectNode): ValidationResult {
	if (node.aspects && node.aspects.length > 0) {
		return left(ValidationError.from(new CannotHaveAspectsError(node.uuid)));
	}

	return right(true);
}
