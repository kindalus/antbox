import { AntboxError } from "../../shared/antbox_error.ts";

export class SmartFolderNodeNotFoundError extends AntboxError {
  static ERROR_CODE = "SmartFolderNodeNotFoundError";

  constructor(uuid: string) {
    super(
      SmartFolderNodeNotFoundError.ERROR_CODE,
      `The smart folder with uuid "${uuid}" was not found`
    );
  }
}
