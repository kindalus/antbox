import { AntboxError } from "./antbox_error.ts";

export class ValidationError extends AntboxError {
	static ERROR_CODE = "ValidationError";

	static from(...errors: AntboxError[]): ValidationError {
		const messages = errors.map((e) => e.message).join("\n");
		return new ValidationError(messages, errors);
	}

	constructor(message: string, readonly errors: AntboxError[]) {
		super(ValidationError.ERROR_CODE, message);
	}

	has(errorCode: string): boolean {
		return this.errors.some((e) => e.errorCode === errorCode);
	}
}
