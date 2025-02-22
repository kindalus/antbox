import { AntboxError } from "shared/antbox_error.ts";

export class NodeFileNotFoundError extends AntboxError {
  static ERROR_CODE = "NodeFileNotFoundError";

  constructor(uuid: string) {
    super(
      NodeFileNotFoundError.ERROR_CODE,
      `Could not find file with uuid: ${uuid}`,
    );
  }
}
