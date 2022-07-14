import EcmError from "/shared/ecm_error.ts";

export default class NodeNotFoundError implements EcmError {
	static ERROR_CODE = "NodeNotFoundError";

	readonly errorCode: string;
	readonly message: string;

	constructor(uuid: string) {
		this.errorCode = NodeNotFoundError.ERROR_CODE;
		this.message = `Could not find node with uuid: ${uuid}`;
	}
}
