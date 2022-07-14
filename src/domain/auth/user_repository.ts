import UserNotFoundError from "./user_not_found_error.ts";
import EcmError from "/shared/ecm_error.ts";
import User from "./user.ts";
import Either from "/shared/either.ts";
import Email from "./email.ts";

export default interface UserRepository {
	get(email: Email): Promise<Either<User, UserNotFoundError>>;
	count(): Promise<Either<number, EcmError>>;
	addOrReplace(user: User): Promise<Either<undefined, EcmError>>;
}
