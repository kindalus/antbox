import { EcmError } from "/shared/ecm_error.ts";
import { Either, left, right } from "/shared/either.ts";
import { InvalidFullnameFormatError } from "./invalid_fullname_format_error.ts";

export class Fullname {
  readonly value: string;

  public static make(value: string): Either<EcmError, Fullname> {
    if (!(value?.length > 0)) {
      return left(new InvalidFullnameFormatError(value));
    }
    return right(new Fullname(value));
  }

  private constructor(value: string) {
    this.value = value;
  }
}
