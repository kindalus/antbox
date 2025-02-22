import { AntboxError } from "shared/antbox_error.ts";

export class InvalidMimetypeError extends AntboxError {
  static ERROR_CODE = "InvalidMimetypeError";

  constructor(mimetype: string) {
    super(InvalidMimetypeError.ERROR_CODE, `Invalid Mimetype: ${mimetype}`);
  }
}
