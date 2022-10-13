import { EcmError } from "/shared/ecm_error.ts";

export class SmartFolderNodeNotFoundError extends EcmError {
  static ERROR_CODE = "SmartFolderNodeNotFoundError";

  constructor(uuid: string) {
    super(
      SmartFolderNodeNotFoundError.ERROR_CODE,
      `The smart folder with uuid "${uuid}" was not found`
    );
  }
}
