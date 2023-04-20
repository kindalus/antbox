import { left, right } from "../../shared/either.ts";
import {
  CompositeSpecification,
  ValidationResult,
} from "../../shared/specification.ts";
import { ValidationError } from "../../shared/validation_error.ts";
import { Group } from "./group.ts";
import { InvalidGroupNameFormatError } from "./invalid_group_name_format_error.ts";

export class GroupSpec extends CompositeSpecification<Group> {
  constructor() {
    super(fullnameSpec);
  }
}

function fullnameSpec(g: Group): ValidationResult {
  if (g.title.length < 3) {
    return left(ValidationError.from(new InvalidGroupNameFormatError(g.title)));
  }

  return right(true);
}
