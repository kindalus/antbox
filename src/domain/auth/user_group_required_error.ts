import { AntboxError } from "../../shared/antbox_error.ts";

export class UserGroupRequiredError extends AntboxError {
	static ERROR_CODE = "UserGroupRequiredError";

	constructor() {
		super(
			UserGroupRequiredError.ERROR_CODE,
			`User must have at least one group`,
		);
	}
}
