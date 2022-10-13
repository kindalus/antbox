import { Either, success } from "/shared/either.ts";
import { EcmError } from "/shared/ecm_error.ts";
import { GroupName } from "./group_name.ts";

export class Group {
  static make(id: string, name: GroupName): Either<EcmError, Group> {
    return right(new Group(id, name));
  }

  private constructor(readonly id: string, readonly name: GroupName) {}
}
