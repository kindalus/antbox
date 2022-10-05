import { Either, success } from "/shared/either.ts";
import { EcmError } from "/shared/ecm_error.ts";

export class Password {
  static make(value: string): Either<Password, EcmError> {
    return success(new Password(value));
  }

  readonly digestedPassword: string;

  private constructor(plainPassword: string) {
    this.digestedPassword = plainPassword;
  }
}
