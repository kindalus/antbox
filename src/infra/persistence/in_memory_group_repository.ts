import Group from "/domain/auth/group.ts";

import GroupRepository from "/domain/auth/group_repository.ts";
import EcmError from "/shared/ecm_error.ts";
import Either, { success } from "/shared/either.ts";

export default class InMemoryGroupRepository implements GroupRepository {
	private _groups: Record<string, Group> = {};

	addOrReplace(group: Group): Promise<Either<undefined, EcmError>> {
		this._groups[group.id] = group;

		return Promise.resolve(success(undefined));
	}
}
