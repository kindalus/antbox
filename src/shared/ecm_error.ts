export abstract class EcmError extends Error {
  constructor(readonly errorCode: string, readonly message: string) {
    super(message);
  }
}

export class ForbiddenError extends EcmError {
  constructor() {
    super("ForbiddenError", "You are not allowed to perform this action");
  }
}
