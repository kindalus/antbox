import EcmError from "../ecm_error.ts";
import Either, { success } from "../../helpers/either.ts";

export default class Fullname {
	readonly value: string;

	public static make(value: string): Either<Fullname, EcmError> {
		return success(new Fullname(value));
	}

	private constructor(value: string) {
		this.value = value;
	}
}
