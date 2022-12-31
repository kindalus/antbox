import { AntboxError } from "../../shared/antbox_error.ts";

export class ValidationError extends AntboxError {
  static ERROR_CODE = "ValidationError";
  constructor(message: string) {
    super(ValidationError.ERROR_CODE, message);
  }
}
