import { AntboxError } from "/shared/antbox_error.ts";

export class NodeNotFoundError extends AntboxError {
  static ERROR_CODE = "NodeNotFoundError";

  constructor(uuid: string) {
    super(
      NodeNotFoundError.ERROR_CODE,
      `Could not find node with uuid: ${uuid}`
    );
  }
}
