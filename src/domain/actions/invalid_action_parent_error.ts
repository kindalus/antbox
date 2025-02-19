import { AntboxError } from "../../shared/antbox_error.ts";

export class InvalidActionParentError extends AntboxError {
	static ERROR_CODE = "InvalidActionParent";

	constructor(parent: string) {
		super(InvalidActionParentError.ERROR_CODE, `Invalid Action Parent: ${parent}`);
	}
}
