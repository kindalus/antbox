import { Either, error, success } from "/shared/either.ts";
import { EcmError } from "/shared/ecm_error.ts";
import { InvalidGroupNameFormatError } from "./invalid_group_name_format_error.ts";

export class GroupName {
  static make(name: string): Either<GroupName, EcmError> {
    if (name?.length < 1) {
      return error(new InvalidGroupNameFormatError(name));
    }

    return success(new GroupName(name));
  }

  private constructor(readonly value: string) {}
}
