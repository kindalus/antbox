import { AntboxError } from "../../shared/antbox_error.ts";

export class CannotHaveAspectsError extends AntboxError {
	static CANNOT_HAVE_ASPECTS_ERROR = "CannotHaveAspectsError";
	constructor(uuid: string) {
		super(CannotHaveAspectsError.CANNOT_HAVE_ASPECTS_ERROR, `Cannot have aspects: '${uuid}'`);
	}
}
