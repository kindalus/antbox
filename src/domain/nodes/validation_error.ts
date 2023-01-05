import { AntboxError } from "../../shared/antbox_error.ts";

export class ValidationError extends AntboxError {
  static ERROR_CODE = "ValidationError";

  static fromMsgs(...msg: string[]): ValidationError {
    const errors = msg.map((m) => new InnerValidationError(m));

    return new ValidationError("Validation error", errors);
  }

  private constructor(
    message: string,
    readonly errors: InnerValidationError[]
  ) {
    super(ValidationError.ERROR_CODE, message);
  }
}

class InnerValidationError extends AntboxError {
  static ERROR_CODE = "InnerValidationError";
  constructor(message: string) {
    super(InnerValidationError.ERROR_CODE, message);
  }
}
