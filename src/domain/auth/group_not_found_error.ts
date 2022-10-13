import { EcmError } from "/shared/ecm_error.ts";

export default class GroupNotFoundError extends EcmError {
  static ERROR_CODE = "GroupNotFoundError";

  constructor(id: string) {
    super(GroupNotFoundError.ERROR_CODE, `Group not found for the id: ${id}`);
  }
}
