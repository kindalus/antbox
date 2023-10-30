import { left, right } from "../../shared/either.ts";
import { RegexSpec } from "../../shared/regex_spec.ts";
import { andSpecification, specFn, ValidationResult } from "../../shared/specification.ts";
import { ValidationError } from "../../shared/validation_error.ts";
import { UserNode } from "../nodes/user_node.ts";
import { InvalidEmailFormatError } from "./invalid_email_format_error.ts";
import { InvalidFullnameFormatError } from "./invalid_fullname_format_error.ts";
import { UserGroupRequiredError } from "./user_group_required_error.ts";

export const UserSpec = andSpecification<UserNode>(
	specFn(fullnameSpec),
	specFn(emailSpec),
	specFn(groupRequiredSpec),
);

function emailSpec(u: UserNode): ValidationResult {
	const EMAIL_REGEX =
		/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
	const spec = new RegexSpec(EMAIL_REGEX);

	if (spec.isSatisfiedBy(u.email!).isLeft()) {
		return left(ValidationError.from(new InvalidEmailFormatError(u.email!)));
	}

	return right(true);
}

function fullnameSpec(u: UserNode): ValidationResult {
	if (!u.title || u.title.length < 3) {
		return left(
			ValidationError.from(new InvalidFullnameFormatError(u.title!)),
		);
	}

	return right(true);
}

function groupRequiredSpec(u: UserNode): ValidationResult {
	if (!u.group || u.group.length === 0) {
		return left(
			ValidationError.from(new UserGroupRequiredError()),
		);
	}

	return right(true);
}
