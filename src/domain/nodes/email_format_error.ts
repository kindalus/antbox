import { AntboxError } from "shared/antbox_error.ts";

export class EmailFormatError extends AntboxError {
  static ERROR_CODE = "EmailFormatError";

  constructor(email: string) {
    super(EmailFormatError.ERROR_CODE, `Invalid Email Format: ${email}`);
  }
}
