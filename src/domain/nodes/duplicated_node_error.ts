import { AntboxError } from "shared/antbox_error.ts";

export class DuplicatedNodeError extends AntboxError {
  static ERROR_CODE = "DuplicatedNodeError";

  constructor(uuid: string) {
    super(
      DuplicatedNodeError.ERROR_CODE,
      `Node with uuid: ${uuid}; already exists`,
    );
  }
}
