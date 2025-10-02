import { AntboxError } from "shared/antbox_error.ts";

export class FeatureNotFoundError extends AntboxError {
	static ERROR_CODE = "FeatureNotFoundError";

	constructor(uuid: string) {
		super(
			FeatureNotFoundError.ERROR_CODE,
			`Could not find feature with uuid: ${uuid}`,
		);
	}
}
