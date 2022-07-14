import Email from "/domain/auth/email.ts";
import User from "/domain/auth/user.ts";
import UserNotFoundError from "/domain/auth/user_not_found_error.ts";
import UserRepository from "/domain/auth/user_repository.ts";
import EcmError from "/shared/ecm_error.ts";
import Either, { error, success } from "/shared/either.ts";

export default class InMemoryUserRepository implements UserRepository {
	private _users: Record<string, User> = {};

	get(email: Email): Promise<Either<User, UserNotFoundError>> {
		const user = this._users[email.value] = this._users[email.value];

		if (!user) {
			return Promise.resolve(error(new UserNotFoundError(email)));
		}

		return Promise.resolve(success(user));
	}

	count(): Promise<Either<number, EcmError>> {
		throw new Error("Method not implemented.");
	}

	addOrReplace(user: User): Promise<Either<undefined, EcmError>> {
		this._users[user.email.value] = user;

		return Promise.resolve(success(undefined));
	}
}
