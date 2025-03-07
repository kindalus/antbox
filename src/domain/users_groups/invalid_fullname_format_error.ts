import { AntboxError } from "shared/antbox_error.ts";

export class InvalidFullNameFormatError extends AntboxError {
  static ERROR_CODE = "InvalidFullnameFormatError";

  constructor(fullName: string) {
    super(
      InvalidFullNameFormatError.ERROR_CODE,
      `Invalid Fullname Format: ${ fullName }`,
    );
  }
}
