import { AntboxError } from "shared/antbox_error.ts";

export const ASPECT_VALIDATION_ERROR = "AspectValidationError";

export class AspectValidationError extends AntboxError {
	constructor(message: string) {
		super(ASPECT_VALIDATION_ERROR, message);
	}
}
