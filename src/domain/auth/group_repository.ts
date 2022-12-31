import { AntboxError } from "/shared/antbox_error.ts";
import { Either } from "/shared/either.ts";
import { Group } from "/domain/auth/group.ts";

export interface GroupRepository {
  addOrReplace(group: Group): Promise<Either<AntboxError, undefined>>;
}
