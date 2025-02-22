import { AntboxError } from "shared/antbox_error.ts";

export class PropertyRequiredError extends AntboxError {
  static ERROR_CODE = "PropertyRequiredError";

  constructor(property: string) {
    super(PropertyRequiredError.ERROR_CODE, `${property} is required`);
  }
}
