import EcmError from "../../shared/ecm_error.ts";
import Either from "../../shared/either.ts";
import Group from "../../domain/auth/group.ts";

export default interface UserRepository {
	addOrReplace(group: Group): Promise<Either<void, EcmError>>;
}
