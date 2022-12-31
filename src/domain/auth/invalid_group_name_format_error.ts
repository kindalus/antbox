import { AntboxError } from "/shared/antbox_error.ts";

export class InvalidGroupNameFormatError extends AntboxError {
  static ERROR_CODE = "InvalidGroupNameFormatError";

  constructor(name: string) {
    super(
      InvalidGroupNameFormatError.ERROR_CODE,
      `Invalid Group Name Format: ${name}`
    );
  }
}
