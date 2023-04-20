import { AntboxError } from "./antbox_error.ts";

export class ValidationError extends AntboxError {
  static ERROR_CODE = "ValidationError";

  static from(...errors: AntboxError[]): ValidationError {
    return new ValidationError("Validation error", errors);
  }

  private constructor(message: string, readonly errors: AntboxError[]) {
    super(ValidationError.ERROR_CODE, message);
  }

  has(errorCode: string): boolean {
    return this.errors.some((e) => e.errorCode === errorCode);
  }
}
