import { Either, left, right } from "../../shared/either.ts";
import { ValidationError } from "../../shared/validation_error.ts";
import { EmailFormatError } from "./email_format_error.ts";

export class EmailValue {
	static fromString(value: string): Either<ValidationError, EmailValue> {
		try {
			return right(new EmailValue(value));
		} catch (err) {
			return left(err as ValidationError);
		}
	}

	private constructor(readonly value: string) {
		// const EMAIL_REGEX =
		// 	/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

		const email_regex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/

		if (!email_regex.test(value)) {
			throw ValidationError.from(new EmailFormatError(value));
		}
	}
}
