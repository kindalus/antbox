import { AntboxError } from "./antbox_error.ts";
import { right, left } from "./either.ts";
import { CompositeSpecification } from "./specification.ts";
import { ValidationError } from "./validation_error.ts";

export class RegexSpec extends CompositeSpecification<string> {
  constructor(regex: RegExp) {
    super((candidate: string) => {
      if (regex.test(candidate)) {
        return right(true);
      }

      return left(ValidationError.from(new RegexError()));
    });
  }
}

export class RegexError extends AntboxError {
  static readonly ERROR_CODE = "Regex";
  constructor() {
    super(RegexError.ERROR_CODE, "Invalid format");
  }
}
