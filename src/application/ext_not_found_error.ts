import { AntboxError } from "shared/antbox_error.ts";

export class ExtNotFoundError extends AntboxError {
  static ERROR_CODE = "ExtNotFoundError";

  constructor(uuid: string) {
    super(
        ExtNotFoundError.ERROR_CODE,
      `Could not find node with uuid: ${uuid}`,
    );
  }
}