import EngineError from "./engine_error.ts";

export default class SmartFolderNodeNotFoundError extends EngineError {
	static ERROR_CODE = "SmartFolderNodeNotFoundError";

	constructor(uuid: string) {
		super(
			SmartFolderNodeNotFoundError.ERROR_CODE,
			`The smart folder with uuid "${uuid}" was not found`,
		);
	}
}
