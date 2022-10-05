import { EcmError } from "/shared/ecm_error.ts";

export class FolderNotFoundError implements EcmError {
  static ERROR_CODE = "FolderNotFoundError";
  readonly errorCode: string;
  readonly message: string;

  constructor(uuid: string) {
    this.errorCode = FolderNotFoundError.ERROR_CODE;
    this.message = `The folder with uuid "${uuid}" was not found`;
  }
}
