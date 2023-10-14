import { left, right } from "../../shared/either.ts";
import { RegexSpec } from "../../shared/regex_spec.ts";
import { AndSpecification, specFn, ValidationResult } from "../../shared/specification.ts";
import { ValidationError } from "../../shared/validation_error.ts";
import { InvalidEmailFormatError } from "./invalid_email_format_error.ts";
import { InvalidFullnameFormatError } from "./invalid_fullname_format_error.ts";
import { User } from "./user.ts";
import { UserGroupRequiredError } from "./user_group_required_error.ts";

export class UserSpec extends AndSpecification<User> {
	constructor() {
		super(specFn(fullnameSpec), specFn(emailSpec), specFn(groupRequiredSpec));
	}
}

function emailSpec(u: User): ValidationResult {
	const EMAIL_REGEX =
		/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
	const spec = new RegexSpec(EMAIL_REGEX);

	if (spec.isSatisfiedBy(u.email).isLeft()) {
		return left(ValidationError.from(new InvalidEmailFormatError(u.email)));
	}

	return right(true);
}

function fullnameSpec(u: User): ValidationResult {
	if (!u.fullname || u.fullname.length < 3) {
		return left(
			ValidationError.from(new InvalidFullnameFormatError(u.fullname)),
		);
	}

	return right(true);
}

function groupRequiredSpec(u: User): ValidationResult {
	if (!u.group || u.group.length === 0) {
		return left(
			ValidationError.from(new UserGroupRequiredError()),
		);
	}

	return right(true);
}
