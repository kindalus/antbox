import { Group } from "/domain/auth/group.ts";

import { GroupRepository } from "/domain/auth/group_repository.ts";
import { AntboxError } from "/shared/antbox_error.ts";
import { Either, right } from "/shared/either.ts";

export class InMemoryGroupRepository implements GroupRepository {
  private _groups: Record<string, Group> = {};

  addOrReplace(group: Group): Promise<Either<AntboxError, undefined>> {
    this._groups[group.id] = group;

    return Promise.resolve(right(undefined));
  }
}
