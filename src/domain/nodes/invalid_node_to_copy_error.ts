import { AntboxError } from "../../shared/antbox_error.ts";

export class InvalidNodeToCopyError extends AntboxError {
  static ERROR_CODE = "InvalidNodeToCopyError";

  constructor(uuid: string) {
    super(
      InvalidNodeToCopyError.ERROR_CODE,
      `Cannot copy the node with uuid: ${uuid}`
    );
  }
}
