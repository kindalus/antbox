import EngineError from "./engine_error.ts";

export default class InvalidNodeToCopyError extends EngineError {
	static ERROR_CODE = "InvalidNodeToCopyError";

	constructor(uuid: string) {
		super(
			InvalidNodeToCopyError.ERROR_CODE,
			`Cannot copy the node with uuid: ${uuid}`,
		);
	}
}
