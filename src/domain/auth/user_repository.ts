import { UserNotFoundError } from "./user_not_found_error.ts";
import { EcmError } from "/shared/ecm_error.ts";
import { User } from "./user.ts";
import { Either } from "/shared/either.ts";
import { Email } from "./email.ts";

export interface UserRepository {
  get(email: Email): Promise<Either<UserNotFoundError, User>>;
  count(): Promise<Either<EcmError, number>>;
  addOrReplace(user: User): Promise<Either<EcmError, undefined>>;
}
