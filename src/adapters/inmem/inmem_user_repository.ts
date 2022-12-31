import { Email } from "/domain/auth/email.ts";
import { User } from "/domain/auth/user.ts";
import { UserNotFoundError } from "/domain/auth/user_not_found_error.ts";
import { UserRepository } from "/domain/auth/user_repository.ts";
import { AntboxError } from "/shared/antbox_error.ts";
import { Either, left, right } from "/shared/either.ts";

export class InMemoryUserRepository implements UserRepository {
  private _users: Record<string, User> = {};

  get(email: Email): Promise<Either<UserNotFoundError, User>> {
    const user = (this._users[email.value] = this._users[email.value]);

    if (!user) {
      return Promise.resolve(left(new UserNotFoundError(email)));
    }

    return Promise.resolve(right(user));
  }

  count(): Promise<Either<AntboxError, number>> {
    throw new Error("Method not implemented.");
  }

  addOrReplace(user: User): Promise<Either<AntboxError, undefined>> {
    this._users[user.email.value] = user;

    return Promise.resolve(right(undefined));
  }
}
