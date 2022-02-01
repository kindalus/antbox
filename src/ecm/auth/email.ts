import EcmError from "../ecm_error.ts";
import Either, { success } from "../../helpers/either.ts";

export default class Email {
	readonly value: string;

	public static make(value: string): Either<Email, EcmError> {
		return success(new Email(value));
	}

	private constructor(value: string) {
		this.value = value;
	}
}
