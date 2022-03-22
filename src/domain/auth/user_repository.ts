import EcmError from "../../shared/ecm_error.ts";
import User from "./user.ts";
import Either from "../../shared/either.ts";

export default interface UserRepository {
	addOrReplace(user: User): Promise<Either<void, EcmError>>;
}
