import { EcmError } from "/shared/ecm_error.ts";

export class InvalidEmailFormatError extends EcmError {
  static ERROR_CODE = "InvalidEmailFormatError";

  constructor(email: string) {
    super(InvalidEmailFormatError.ERROR_CODE, `Invalid Email Format: ${email}`);
  }
}
