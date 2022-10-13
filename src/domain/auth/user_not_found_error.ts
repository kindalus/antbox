import { EcmError } from "/shared/ecm_error.ts";
import { Email } from "./email.ts";

export class UserNotFoundError extends EcmError {
  static ERROR_CODE = "UserNotFoundError";

  constructor(email: Email) {
    super(
      UserNotFoundError.ERROR_CODE,
      `User not found for the email: ${email.value}`
    );
  }
}
