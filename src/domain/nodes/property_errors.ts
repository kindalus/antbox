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

export class UnknownPropertyError extends AntboxError {
  static ERROR_CODE = "UnknownPropertyError";

  constructor(property: string, message: string) {
    super(
      UnknownPropertyError.ERROR_CODE,
      `${property} is unknown property. ${message}`,
    );
  }
}

export class PropertyNotInListError extends AntboxError {
  static ERROR_CODE = "PropertyNotInListError";

  constructor(property: string, list: string[], value: string) {
    super(
      PropertyNotInListError.ERROR_CODE,
      `Property ${property} has value '${value}' which is not in the allowed list: [${
        list.join(", ")
      }]`,
    );
  }
}

export class PropertyDoesNotMatchRegexError extends AntboxError {
  static ERROR_CODE = "PropertyDoesNotMatchRegexError";

  constructor(property: string, regex: string, value: string) {
    super(
      PropertyDoesNotMatchRegexError.ERROR_CODE,
      `Property ${property} has value '${value}' which does not match the required pattern: ${regex}`,
    );
  }
}