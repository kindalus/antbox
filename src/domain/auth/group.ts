import Either, { success } from "../../shared/either.ts";
import ECMError from "../../shared/ecm_error.ts";
import GroupName from "./group_name.ts";

export default class Group {
	static make(id: string, name: GroupName): Either<Group, ECMError> {
		return success(new Group(id, name));
	}

	private constructor(
		readonly id: string,
		readonly name: GroupName,
	) {}
}
