import EcmError from "../ecm_error.ts";
import User from "./user.ts";
import Either from "../../helpers/either.ts";

export default interface UserRepository {
	addOrReplace(user: User): Promise<Either<void, EcmError>>;
}
