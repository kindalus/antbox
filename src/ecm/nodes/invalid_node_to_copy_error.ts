import EcmError from "../ecm_error.ts";

export default class InvalidNodeToCopyError implements EcmError {
	static ERROR_CODE = "InvalidNodeToCopyError";

	readonly errorCode: string;
	readonly message: string;

	constructor(uuid: string) {
		this.errorCode = InvalidNodeToCopyError.ERROR_CODE;
		this.message = `Cannot copy the node with uuid: ${uuid}`;
	}
}
