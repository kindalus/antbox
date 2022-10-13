import { UserPrincipal } from "/domain/auth/user_principal.ts";
import { PasswordGenerator } from "/domain/auth/password_generator.ts";
import { EmailSender } from "./email_sender.ts";
import { EcmError } from "/shared/ecm_error.ts";
import { Either, left, right } from "/shared/either.ts";
import { Email } from "/domain/auth/email.ts";
import { Fullname } from "/domain/auth/fullname.ts";
import { User } from "/domain/auth/user.ts";
import { Password } from "/domain/auth/password.ts";
import { UserRepository } from "/domain/auth/user_repository.ts";
import { GroupRepository } from "/domain/auth/group_repository.ts";
import { Group } from "/domain/auth/group.ts";
import { UuidGenerator } from "/domain/providers/uuid_generator.ts";
import { DomainEvents } from "./domain_events.ts";
import { UserCreatedEvent } from "/domain/auth/user_created_event.ts";
import { GroupCreatedEvent } from "/domain/auth/group_created_event.ts";
import { GroupName } from "/domain/auth/group_name.ts";

import { UserNotFoundError } from "/domain/auth/user_not_found_error.ts";
import { Role } from "../domain/auth/role.ts";

export interface AuthServiceContext {
  uuidGenerator: UuidGenerator;
  passwordGenerator: PasswordGenerator;
  emailSender: EmailSender;
  userRepository: UserRepository;
  groupRepository: GroupRepository;
}

export class AuthService {
  constructor(private readonly ctx: AuthServiceContext) {}

  async createGroup(name: string): Promise<Either<EcmError, void>> {
    const id = this.ctx.uuidGenerator.generate();

    const groupNameOrError = GroupName.make(name);

    if (groupNameOrError.isLeft()) {
      return left(groupNameOrError.value);
    }

    const groupOrError = Group.make(id, groupNameOrError.success as GroupName);

    if (groupOrError.isLeft()) {
      return left(groupOrError.value);
    }

    const group = groupOrError.success as Group;

    const repoResult = await this.ctx.groupRepository.addOrReplace(group);

    if (repoResult.isLeft()) {
      return left(repoResult.value);
    }

    DomainEvents.notify(new GroupCreatedEvent(id, group.name.value));

    return right(undefined);
  }

  async createUser(
    email: string,
    fullname: string
  ): Promise<Either<EcmError, void>> {
    const emailOrError = Email.make(email);
    if (emailOrError.isLeft()) {
      return left(emailOrError.value);
    }

    const fullnameOrError = Fullname.make(fullname);
    if (fullnameOrError.isLeft()) {
      return left(fullnameOrError.value);
    }

    const plainPassword = this.ctx.passwordGenerator.generate();
    const passwordOrError = Password.make(plainPassword);

    const user = new User(
      emailOrError.value,
      fullnameOrError.value,
      passwordOrError.value
    );

    const repoResult = await this.ctx.userRepository.addOrReplace(user);

    if (repoResult.isLeft()) {
      return left(repoResult.value);
    }

    this.ctx.emailSender.send(user.email, user.fullname, passwordOrError.value);

    DomainEvents.notify(
      new UserCreatedEvent(user.email.value, user.fullname.value)
    );

    return right(undefined);
  }

  authenticate(
    username: string,
    _password: string
  ): Promise<Either<UserNotFoundError, UserAuthenticationModel>> {
    return Promise.resolve(right({ username, roles: ["Admin"] }));
  }

  getSystemUser(): UserPrincipal {
    return {
      username: "system",
      groups: ["System"],
      roles: [Role.Admin],
    };
  }
}

export interface UserAuthenticationModel {
  readonly username: string;
  readonly roles: string[];
}
