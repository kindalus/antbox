import { EcmError } from "/shared/ecm_error.ts";

export class InvalidGroupNameFormatError extends EcmError {
  static ERROR_CODE = "InvalidGroupNameFormatError";

  constructor(name: string) {
    super(
      InvalidGroupNameFormatError.ERROR_CODE,
      `Invalid Group Name Format: ${name}`
    );
  }
}
