import { AntboxError } from "shared/antbox_error.ts";

export class InvalidCredentialsError extends AntboxError {
  static ERROR_CODE = "InvalidCredentialsError";

  constructor() {
    super(InvalidCredentialsError.ERROR_CODE, "Invalid credentials provided.");
  }
}
