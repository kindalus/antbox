import { EcmError } from "/shared/ecm_error.ts";

export default class GroupNotFoundError implements EcmError {
  static ERROR_CODE = "GroupNotFoundError";

  readonly errorCode: string;
  readonly message: string;

  constructor(id: string) {
    this.errorCode = GroupNotFoundError.ERROR_CODE;
    this.message = `Group not found for the id: ${id}`;
  }
}
