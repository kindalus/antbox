import { AntboxError } from "shared/antbox_error.ts";

export class UsernameAlreadyExists extends AntboxError {
  static ERROR_CODE = "UsernameAlreadyExists";

  constructor(username: string) {
    super(
        UsernameAlreadyExists.ERROR_CODE,
      `Already exists user with this username: ${ username }`,
    );
  }
}
