import { AntboxError } from "../../shared/antbox_error.ts";

export class InvalidEmailFormatError extends AntboxError {
  static ERROR_CODE = "InvalidEmailFormatError";

  constructor(email: string) {
    super(InvalidEmailFormatError.ERROR_CODE, `Invalid Email Format: ${email}`);
  }
}
