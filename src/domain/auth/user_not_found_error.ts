import { AntboxError } from "/shared/antbox_error.ts";
import { Email } from "./email.ts";

export class UserNotFoundError extends AntboxError {
  static ERROR_CODE = "UserNotFoundError";

  constructor(email: Email) {
    super(
      UserNotFoundError.ERROR_CODE,
      `User not found for the email: ${email.value}`
    );
  }
}
