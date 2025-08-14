import { AntboxError } from "shared/antbox_error.ts";

export class FunctionNotFoundError extends AntboxError {
  static ERROR_CODE = "FunctionNotFoundError";

  constructor(uuid: string) {
    super(
      FunctionNotFoundError.ERROR_CODE,
      `Could not find function with uuid: ${uuid}`,
    );
  }
}