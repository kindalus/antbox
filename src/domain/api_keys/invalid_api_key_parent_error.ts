import { AntboxError } from "../../shared/antbox_error.ts";

export class InvalidApiKeyParentError extends AntboxError {
	static ERROR_CODE = "InvalidApiKeyParent";

	constructor(parent: string) {
		super(InvalidApiKeyParentError.ERROR_CODE, `Invalid ApiKey Parent: ${parent}`);
	}
}
