import { AntboxError } from "shared/antbox_error.ts";

export class FolderNotFoundError extends AntboxError {
	static ERROR_CODE = "FolderNotFoundError";

	constructor(uuid: string) {
		super(
			FolderNotFoundError.ERROR_CODE,
			`The folder with uuid "${uuid}" was not found`,
		);
	}
}
