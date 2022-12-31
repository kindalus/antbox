import { Either, left, right } from "/shared/either.ts";
import { AntboxError } from "/shared/antbox_error.ts";
import { InvalidGroupNameFormatError } from "./invalid_group_name_format_error.ts";

export class GroupName {
  static make(name: string): Either<AntboxError, GroupName> {
    if (name?.length < 1) {
      return left(new InvalidGroupNameFormatError(name));
    }

    return right(new GroupName(name));
  }

  private constructor(readonly value: string) {}
}
