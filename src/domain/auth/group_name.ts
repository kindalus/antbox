import Either, { error, success } from "../../shared/either.ts";
import ECMError from "../../shared/ecm_error.ts";
import InvalidGroupNameFormatError from "./invalid_group_name_format_error.ts";

export default class GroupName {
	static make(name: string): Either<GroupName, ECMError> {
		if (name?.length < 1) {
			return error(new InvalidGroupNameFormatError(name));
		}

		return success(new GroupName(name));
	}

	private constructor(readonly value: string) {}
}
