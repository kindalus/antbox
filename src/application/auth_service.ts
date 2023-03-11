import { AntboxError } from "/shared/antbox_error.ts";
import { Either, left } from "/shared/either.ts";
import { Email } from "/domain/auth/email.ts";
import { Fullname } from "/domain/auth/fullname.ts";
import { User } from "/domain/auth/user.ts";
import { Group } from "/domain/auth/group.ts";
import { GroupName } from "/domain/auth/group_name.ts";

import { NodeService } from "./node_service.ts";
import { Node } from "../domain/nodes/node.ts";

export class AuthService {
  static USERS_FOLDER_UUID = "--users--";
  static GROUPS_FOLDER_UUID = "--groups--";
  static ACCESS_TOKENS_FOLDER_UUID = "--access-tokens--";

  constructor(private readonly nodeService: NodeService) {}

  createGroup(group: Group): Promise<Either<AntboxError, Node>> {
    const groupNameOrError = GroupName.make(group.title);

    if (groupNameOrError.isLeft()) {
      return Promise.resolve(left(groupNameOrError.value));
    }

    return this.nodeService.createMetanode({
      ...group,
      uuid: group.uuid ?? this.nodeService.uuidGenerator.generate(),
      parent: AuthService.GROUPS_FOLDER_UUID,
      aspects: ["group"],
    });
  }

  createUser(user: User): Promise<Either<AntboxError, Node>> {
    const emailOrError = Email.make(user.email);
    if (emailOrError.isLeft()) {
      return Promise.resolve(left(emailOrError.value));
    }

    const fullnameOrError = Fullname.make(user.fullname);
    if (fullnameOrError.isLeft()) {
      return Promise.resolve(left(fullnameOrError.value));
    }

    return this.nodeService.createMetanode({
      uuid: user.uuid ?? this.nodeService.uuidGenerator.generate(),
      title: user.fullname,
      parent: AuthService.USERS_FOLDER_UUID,
      aspects: ["user"],
      properties: {
        "user:email": user.email,
        "user:group": user.group,
        "user:groups": user.groups,
      },
    });
  }
}
