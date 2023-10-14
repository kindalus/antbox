import { AntboxError } from "../../shared/antbox_error.ts";

export class ApiKeyNodeFoundError extends AntboxError {
	static ERROR_CODE = "ApiKeyNodeFoundError";
	constructor(uuid: string) {
		super(ApiKeyNodeFoundError.ERROR_CODE, `Apikey node with uuid ${uuid} not found`);
	}
}
