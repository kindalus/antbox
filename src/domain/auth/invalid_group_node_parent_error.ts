import { AntboxError } from "../../shared/antbox_error.ts";

export class InvalidGroupParentError extends AntboxError {
  static ERROR_CODE = "InvalidGroupParent";

  constructor(parent: string) {
    super(
      InvalidGroupParentError.ERROR_CODE,
      `Invalid GroupNode Parent: ${parent}`
    );
  }
}
