import { EcmError } from "/shared/ecm_error.ts";

export class InvalidFullnameFormatError extends EcmError {
  static ERROR_CODE = "InvalidFullnameFormatError";

  constructor(email: string) {
    super(
      InvalidFullnameFormatError.ERROR_CODE,
      `Invalid Fullname Format: ${email}`
    );
  }
}
