import EcmError from "/shared/ecm_error.ts";
import Either, { error, success } from "/shared/either.ts";
import InvalidEmailFormatError from "./invalid_email_format_error.ts";

const EMAIL_RE =
	// deno-lint-ignore no-control-regex
	/(?:[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])/;

export default class Email {
	readonly value: string;

	public static make(value: string): Either<Email, EcmError> {
		if (!value?.match(EMAIL_RE)) {
			return error(new InvalidEmailFormatError(value));
		}

		return success(new Email(value));
	}

	private constructor(value: string) {
		this.value = value;
	}
}
