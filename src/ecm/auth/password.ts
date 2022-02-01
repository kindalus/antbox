import Either, { success } from "../../helpers/either.ts";
import EcmError from "../ecm_error.ts";

export default class Password {
	static make(value: string): Either<Password, EcmError> {
		return success(new Password(value));
	}

	readonly digestedPassword: string;

	private constructor(plainPassword: string) {
		this.digestedPassword = plainPassword;
	}
}
