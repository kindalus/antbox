import { EcmError } from "/shared/ecm_error.ts";
import { Email } from "./email.ts";

export class UserNotFoundError implements EcmError {
  static ERROR_CODE = "UserNotFoundError";

  readonly errorCode: string;
  readonly message: string;

  constructor(email: Email) {
    this.errorCode = UserNotFoundError.ERROR_CODE;
    this.message = `User not found for the email: ${email.value}`;
  }
}
