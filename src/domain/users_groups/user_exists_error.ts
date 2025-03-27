import { AntboxError } from "shared/antbox_error.ts";

export class UserExistsError extends AntboxError {
  static ERROR_CODE = "UserExistsError";

  constructor(email: string) {
    super(
      UserExistsError.ERROR_CODE,
      `User already exists for the uuid: ${email}`,
    );
  }
}
