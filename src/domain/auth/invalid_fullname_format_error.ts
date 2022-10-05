import { EcmError } from "/shared/ecm_error.ts";

export class InvalidFullnameFormatError implements EcmError {
  static ERROR_CODE = "InvalidFullnameFormatError";

  readonly errorCode: string;
  readonly message: string;

  constructor(email: string) {
    this.errorCode = InvalidFullnameFormatError.ERROR_CODE;
    this.message = `Invalid Fullname Format: ${email}`;
  }
}
