import EcmError from "/shared/ecm_error.ts";

export default class SmartFolderNodeNotFoundError implements EcmError {
	static ERROR_CODE = "SmartFolderNodeNotFoundError";

	readonly errorCode: string;
	readonly message: string;

	constructor(uuid: string) {
		this.errorCode = SmartFolderNodeNotFoundError.ERROR_CODE;
		this.message = `The smart folder with uuid "${uuid}" was not found`;
	}
}
