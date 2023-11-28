import { AntboxError } from "../../shared/antbox_error.ts";

const FORM_SPECIFICATION_NOT_FOUND_ERROR = "FormSpecificationNotFoundError";

export class FormSpecificationNotFoundError extends AntboxError {
	constructor(uuid: string) {
		super(FORM_SPECIFICATION_NOT_FOUND_ERROR, `Form specification not found: '${uuid}'`);
	}
}
