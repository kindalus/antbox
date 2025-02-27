import { AntboxError } from "shared/antbox_error.ts";

export class PropertyValueFormatError extends AntboxError {
  static ERROR_CODE = "PropertyValueFormatError";

  constructor(property: string, requiredFormat: string, value: unknown) {
    super(
      PropertyValueFormatError.ERROR_CODE,
      `${property} is required to be in ${requiredFormat} format, but got ${value}`,
    );
  }
}
