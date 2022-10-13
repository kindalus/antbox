import { EcmError } from "/shared/ecm_error.ts";

export class InvalidNodeToCopyError extends EcmError {
  static ERROR_CODE = "InvalidNodeToCopyError";

  constructor(uuid: string) {
    super(
      InvalidNodeToCopyError.ERROR_CODE,
      `Cannot copy the node with uuid: ${uuid}`
    );
  }
}
