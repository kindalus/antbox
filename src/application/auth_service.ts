import { AntboxError } from "/shared/antbox_error.ts";
import { Either, left } from "/shared/either.ts";
import { User } from "/domain/auth/user.ts";
import { Group } from "/domain/auth/group.ts";

import { NodeService } from "./node_service.ts";
import { Node } from "../domain/nodes/node.ts";
import { InvalidGroupNameFormatError } from "../domain/auth/invalid_group_name_format_error.ts";
import { DomainEvents } from "./domain_events.ts";
import { UserCreatedEvent } from "../domain/auth/user_created_event.ts";
import { GroupCreatedEvent } from "../domain/auth/group_created_event.ts";

export class AuthService {
  static USERS_FOLDER_UUID = "--users--";
  static GROUPS_FOLDER_UUID = "--groups--";
  static ACCESS_TOKENS_FOLDER_UUID = "--access-tokens--";

  constructor(private readonly nodeService: NodeService) {}

  async createGroup(group: Partial<Group>): Promise<Either<AntboxError, Node>> {
    if (!group.title || group.title.length === 0) {
      return Promise.resolve(
        left(new InvalidGroupNameFormatError("undefined"))
      );
    }

    const nodeOrErr = await this.nodeService.createMetanode({
      ...group,
      uuid: group.uuid ?? this.nodeService.uuidGenerator.generate(),
      parent: AuthService.GROUPS_FOLDER_UUID,
      aspects: ["group"],
    });

    if (nodeOrErr.isRight()) {
      const evt = new GroupCreatedEvent(
        nodeOrErr.value.owner,
        nodeOrErr.value.uuid,
        nodeOrErr.value.title
      );

      DomainEvents.notify(evt);
    }

    return nodeOrErr;
  }

  async createUser(user: User): Promise<Either<AntboxError, Node>> {
    const node = this.#userToMetanode(user);
    const nodeOrErr = await this.nodeService.createMetanode(node);

    if (nodeOrErr.isRight()) {
      const evt = new UserCreatedEvent(
        nodeOrErr.value.owner,
        user.email,
        user.fullname
      );

      DomainEvents.notify(evt);
    }

    return nodeOrErr;
  }

  #userToMetanode(user: User): Partial<Node> {
    return {
      uuid: user.uuid ?? this.nodeService.uuidGenerator.generate(),
      title: user.fullname,
      parent: AuthService.USERS_FOLDER_UUID,
      aspects: ["user"],
      properties: {
        "user:email": user.email,
        "user:group": user.group,
        "user:groups": user.groups,
      },
    };
  }
}
