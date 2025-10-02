import { AntboxError } from "shared/antbox_error.ts";

export class NodeTypeError extends AntboxError {
	static ERROR_CODE = "NodeTypeError";

	constructor(type: string, operation: string) {
		super(
			NodeTypeError.ERROR_CODE,
			`Invalid Node type for the operation: ${type} - ${operation}`,
		);
	}
}
