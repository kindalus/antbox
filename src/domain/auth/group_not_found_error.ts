import { AntboxError } from "shared/antbox_error.ts";

export default class GroupNotFoundError extends AntboxError {
  static ERROR_CODE = "GroupNotFoundError";

  constructor(id: string) {
    super(GroupNotFoundError.ERROR_CODE, `Group not found for the id: ${id}`);
  }
}
