import { Either, right } from "/shared/either.ts";
import { EcmError } from "/shared/ecm_error.ts";

export class Password {
  static make(value: string): Either<EcmError, Password> {
    return right(new Password(value));
  }

  readonly digestedPassword: string;

  private constructor(plainPassword: string) {
    this.digestedPassword = plainPassword;
  }
}
