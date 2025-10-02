import { AntboxError } from "shared/antbox_error.ts";

export class AspectNotFoundError extends AntboxError {
	static ASPECT_NOT_FOUND_ERROR = "AspectNotFoundError";
	constructor(uuid: string) {
		super(
			AspectNotFoundError.ASPECT_NOT_FOUND_ERROR,
			`Aspect not found: '${uuid}'`,
		);
	}
}
