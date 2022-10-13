import { EcmError } from "/shared/ecm_error.ts";

export class FolderNotFoundError extends EcmError {
  static ERROR_CODE = "FolderNotFoundError";

  constructor(uuid: string) {
    super(
      FolderNotFoundError.ERROR_CODE,
      `The folder with uuid "${uuid}" was not found`
    );
  }
}
