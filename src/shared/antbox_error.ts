export class AntboxError extends Error {
	constructor(readonly errorCode: string, override readonly message: string) {
		super(message);
	}
}

export class ForbiddenError extends AntboxError {
	static ERROR_CODE = "ForbiddenError";

	constructor(message?: string) {
		super(
			ForbiddenError.ERROR_CODE,
			message ?? "You are not allowed to perform this action",
		);
	}
}

export class UnauthorizedError extends AntboxError {
	static ERROR_CODE = "UnauthorizedError";

	constructor() {
		super(
			UnauthorizedError.ERROR_CODE,
			"You are not authorized to perform this action",
		);
	}
}

export class UnknownError extends AntboxError {
	constructor(message: string) {
		super("UnknownError", message);
	}
}

export class BadRequestError extends AntboxError {
	static ERROR_CODE = "BadRequestError";

	constructor(message: string) {
		super(BadRequestError.ERROR_CODE, message);
	}
}
