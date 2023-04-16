import { ValidationError } from "/shared/validation_error.ts";
import { left, right } from "/shared/either.ts";
import { CompositeSpecification } from "./specification.ts";
import { AntboxError } from "./antbox_error.ts";

export class RegexSpec extends CompositeSpecification<string> {
	constructor(regex: RegExp) {
		super((candidate: string) => {
			if (regex.test(candidate)) {
				return right(true);
			}

			return left(ValidationError.from(
				new RegexError(),
			));
		});
	}
}

export class RegexError extends AntboxError {
	static readonly ERROR_CODE = "Regex";
	constructor() {
		super(RegexError.ERROR_CODE, "Invalid format");
	}
}
