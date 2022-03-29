import EcmError from "../../shared/ecm_error.ts";

export default class InvalidGroupNameFormatError implements EcmError {
	static ERROR_CODE = "InvalidGroupNameFormatError";

	readonly errorCode: string;
	readonly message: string;

	constructor(name: string) {
		this.errorCode = InvalidGroupNameFormatError.ERROR_CODE;
		this.message = `Invalid Group Name Format: ${name}`;
	}
}
