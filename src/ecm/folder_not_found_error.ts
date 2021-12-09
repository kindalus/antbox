import EngineError from "./engine_error.ts";

export default class FolderNotFoundError extends EngineError {
	static ERROR_CODE = "FolderNotFoundError";
	constructor(uuid: string) {
		super(
			FolderNotFoundError.ERROR_CODE,
			`The folder with uuid "${uuid}" was not found`,
		);
	}
}
