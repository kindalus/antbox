import { UserPrincipal } from "/domain/auth/user_principal.ts";
import { AntboxError } from "/shared/antbox_error.ts";
import { Either, left } from "/shared/either.ts";
import { Email } from "/domain/auth/email.ts";
import { Fullname } from "/domain/auth/fullname.ts";
import { User } from "/domain/auth/user.ts";
import { Group } from "/domain/auth/group.ts";
import { GroupName } from "/domain/auth/group_name.ts";

import { NodeService } from "./node_service.ts";
import { ValidationError } from "../domain/nodes/validation_error.ts";
import { FolderNotFoundError } from "../domain/nodes/folder_not_found_error.ts";

export class AuthService {
  static USERS_FOLDER_UUID = "--users--";
  static GROUPS_FOLDER_UUID = "--groups--";

  constructor(private readonly nodeService: NodeService) {}

  createGroup(
    group: Group
  ): Promise<Either<AntboxError | ValidationError[], string>> {
    const groupNameOrError = GroupName.make(group.title);

    if (groupNameOrError.isLeft()) {
      return Promise.resolve(left(groupNameOrError.value));
    }

    return this.nodeService.createMetanode({
      ...group,
      parent: AuthService.GROUPS_FOLDER_UUID,
    });
  }

  createUser(
    user: User
  ): Promise<
    Either<AntboxError | FolderNotFoundError | ValidationError[], string>
  > {
    const emailOrError = Email.make(user.email);
    if (emailOrError.isLeft()) {
      return Promise.resolve(left(emailOrError.value));
    }

    const fullnameOrError = Fullname.make(user.fullname);
    if (fullnameOrError.isLeft()) {
      return Promise.resolve(left(fullnameOrError.value));
    }

    return this.nodeService.createMetanode({
      title: user.fullname,
      parent: AuthService.USERS_FOLDER_UUID,
      properties: {
        "user:username": user.username,
        "user:email": user.email,
        "user:group": user.group,
        "user:groups": user.groups,
      },
    });
  }

  getSystemUser(): UserPrincipal {
    return {
      username: "system",
      fullname: "System",
      group: "--system--",
      groups: [],
    };
  }
}
