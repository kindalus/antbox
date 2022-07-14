import EcmError from "/shared/ecm_error.ts";
import Either, { error, success } from "/shared/either.ts";
import InvalidFullnameFormatError from "./invalid_fullname_format_error.ts";

export default class Fullname {
	readonly value: string;

	public static make(value: string): Either<Fullname, EcmError> {
		if (!(value?.length > 0)) {
			return error(new InvalidFullnameFormatError(value));
		}
		return success(new Fullname(value));
	}

	private constructor(value: string) {
		this.value = value;
	}
}
