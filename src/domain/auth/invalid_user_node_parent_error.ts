import { AntboxError } from "../../shared/antbox_error.ts";

export class InvalidUserNodeParentError extends AntboxError {
  static ERROR_CODE = "InvalidUserNodeParentError";

  constructor(parent: string) {
    super(
      InvalidUserNodeParentError.ERROR_CODE,
      `Invalid UserNode Parent: ${parent}`
    );
  }
}
