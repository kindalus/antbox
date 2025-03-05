import { AntboxError } from "shared/antbox_error.ts";

export class PropertyFormatError extends AntboxError {
  static ERROR_CODE = "PropertyFormatError";

  constructor(property: string, requiredFormat: string, value: unknown) {
    super(
      PropertyFormatError.ERROR_CODE,
      `${property} is required to be in ${requiredFormat} format, but got ${value}`,
    );
  }
}

export class PropertyTypeError extends AntboxError {
  static ERROR_CODE = "PropertyTypeError";

  constructor(property: string, requiredType: string, value: unknown) {
    super(
      PropertyTypeError.ERROR_CODE,
      `${property} is required to be of type ${requiredType}, but got ${value}`,
    );
  }
}

export class PropertyRequiredError extends AntboxError {
  static ERROR_CODE = "PropertyRequiredError";

  constructor(property: string) {
    super(PropertyRequiredError.ERROR_CODE, `${property} is required`);
  }
}
