import { AntboxError } from "../../shared/antbox_error.ts";

export class NodeTitleRequiredError extends AntboxError {
	static ERROR_CODE = "NodeTitleRequiredError";

	constructor() {
		super(
			NodeTitleRequiredError.ERROR_CODE,
			"Node title is required",
		);
	}
}
