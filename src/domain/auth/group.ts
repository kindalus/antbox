import Either, { error, success } from "../../shared/either.ts";
import ECMError from "../../shared/ecm_error.ts";
import GroupName from "./group_name.ts";

export default class Group {
	static make(id: string, name: string): Either<Group, ECMError> {
		const nameResult = GroupName.make(name);

		if (nameResult.error) {
			return error(nameResult.error);
		}

		return success(new Group(id, nameResult.success as GroupName));
	}

	private constructor(
		readonly id: string,
		readonly name: GroupName,
	) {}
}
