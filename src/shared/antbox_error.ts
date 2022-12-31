export abstract class AntboxError extends Error {
  constructor(readonly errorCode: string, readonly message: string) {
    super(message);
  }
}

export class ForbiddenError extends AntboxError {
  constructor() {
    super("ForbiddenError", "You are not allowed to perform this action");
  }
}

export class UnknownError extends AntboxError {
  constructor(message: string) {
    super("UnknownError", message);
  }
}
