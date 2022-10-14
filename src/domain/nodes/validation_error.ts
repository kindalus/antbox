import { EcmError } from "../../shared/ecm_error.ts";

export class ValidationError extends EcmError {
  static ERROR_CODE = "ValidationError";
  constructor(message: string) {
    super(ValidationError.ERROR_CODE, message);
  }
}
