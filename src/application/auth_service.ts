import PasswordGenerator from "/domain/auth/password_generator.ts";
import EmailSender from "./email_sender.ts";
import EcmError from "/shared/ecm_error.ts";
import Either, { error, success } from "/shared/either.ts";
import Email from "/domain/auth/email.ts";
import Fullname from "/domain/auth/fullname.ts";
import User from "/domain/auth/user.ts";
import Password from "/domain/auth/password.ts";
import UserRepository from "/domain/auth/user_repository.ts";
import GroupRepository from "/domain/auth/group_repository.ts";
import Group from "/domain/auth/group.ts";
import UuidGenerator from "/domain/providers/uuid_generator.ts";
import DomainEvents from "./domain_events.ts";
import UserCreatedEvent from "/domain/auth/user_created_event.ts";
import GroupCreatedEvent from "/domain/auth/group_created_event.ts";
import GroupName from "/domain/auth/group_name.ts";

import UserNotFoundError from "/domain/auth/user_not_found_error.ts";
import UserAuthenticationModel from "./user_authentication_model.ts";

export interface AuthServiceContext {
	uuidGenerator: UuidGenerator;
	passwordGenerator: PasswordGenerator;
	emailSender: EmailSender;
	userRepository: UserRepository;
	groupRepository: GroupRepository;
}

export default class AuthService {
	constructor(private readonly ctx: AuthServiceContext) {}

	async createGroup(name: string): Promise<Either<void, EcmError>> {
		const id = this.ctx.uuidGenerator.generate();

		const groupNameOrError = GroupName.make(name);

		if (groupNameOrError.error) {
			return error(groupNameOrError.error);
		}

		const groupOrError = Group.make(id, groupNameOrError.success as GroupName);

		if (groupOrError.error) {
			return error(groupOrError.error);
		}

		const group = groupOrError.success as Group;

		const repoResult = await this.ctx.groupRepository.addOrReplace(group);

		if (repoResult.error) {
			return error(repoResult.error);
		}

		DomainEvents.notify(new GroupCreatedEvent(id, group.name.value));

		return success(undefined);
	}

	async createUser(email: string, fullname: string): Promise<Either<void, EcmError>> {
		const emailOrError = Email.make(email);
		if (emailOrError.error) {
			return error(emailOrError.error);
		}

		const fullnameOrError = Fullname.make(fullname);
		if (fullnameOrError.error) {
			return error(fullnameOrError.error);
		}

		const plainPassword = this.ctx.passwordGenerator.generate();
		const passwordOrError = Password.make(plainPassword);

		const user = new User(
			emailOrError.success!,
			fullnameOrError.success!,
			passwordOrError.success!,
		);

		const repoResult = await this.ctx.userRepository.addOrReplace(user);

		if (repoResult.error) {
			return error(repoResult.error);
		}

		this.ctx.emailSender.send(user.email, user.fullname, passwordOrError.success!);

		DomainEvents.notify(new UserCreatedEvent(user.email.value, user.fullname.value));

		return success(undefined);
	}

	authenticate(
		username: string,
		_password: string,
	): Promise<Either<UserAuthenticationModel, UserNotFoundError>> {
		return Promise.resolve(success({ username, roles: ["Admin"] }));
	}
}
