import EcmError from "../../shared/ecm_error.ts";

export default class InvalidEmailFormatError implements EcmError {
	static ERROR_CODE = "InvalidEmailFormatError";

	readonly errorCode: string;
	readonly message: string;

	constructor(email: string) {
		this.errorCode = InvalidEmailFormatError.ERROR_CODE;
		this.message = `Invalid Email Format: ${email}`;
	}
}
