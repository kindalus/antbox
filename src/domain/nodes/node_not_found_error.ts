import { EcmError } from "/shared/ecm_error.ts";

export class NodeNotFoundError extends EcmError {
  static ERROR_CODE = "NodeNotFoundError";

  constructor(uuid: string) {
    super(
      NodeNotFoundError.ERROR_CODE,
      `Could not find node with uuid: ${uuid}`
    );
  }
}
