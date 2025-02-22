import { AntboxError } from "shared/antbox_error.ts";

export class InvalidFullNameFormatError extends AntboxError {
  static ERROR_CODE = "InvalidFullnameFormatError";

  constructor(email: string) {
    super(
      InvalidFullNameFormatError.ERROR_CODE,
      `Invalid Fullname Format: ${email}`,
    );
  }
}
