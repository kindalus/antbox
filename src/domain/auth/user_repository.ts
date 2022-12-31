import { UserNotFoundError } from "./user_not_found_error.ts";
import { AntboxError } from "/shared/antbox_error.ts";
import { User } from "./user.ts";
import { Either } from "/shared/either.ts";
import { Email } from "./email.ts";

export interface UserRepository {
  get(email: Email): Promise<Either<UserNotFoundError, User>>;
  count(): Promise<Either<AntboxError, number>>;
  addOrReplace(user: User): Promise<Either<AntboxError, undefined>>;
}
