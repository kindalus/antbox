import PasswordGenerator from "../domain/auth/password_generator.ts";
import EmailSender from "./email_sender.ts";
import EcmError from "../shared/ecm_error.ts";
import Either, { error, success } from "../shared/either.ts";
import Email from "../domain/auth/email.ts";
import Fullname from "../domain/auth/fullname.ts";
import User from "../domain/auth/user.ts";
import Password from "../domain/auth/password.ts";
import UserRepository from "../domain/auth/user_repository.ts";
import GroupRepository from "../domain/auth/group_repository.ts";
import Group from "../domain/auth/group.ts";
import UuidGenerator from "../domain/providers/uuid_generator.ts";
import DomainEvents from "./domain_events.ts";
import UserCreatedEvent from "../domain/auth/user_created_event.ts";

export interface AuthServiceContext {
	uuidGenerator: UuidGenerator;
	passwordGenerator: PasswordGenerator;
	emailSender: EmailSender;
	userRepository: UserRepository;
	groupRepository: GroupRepository;
}

export default class AuthService {
	createGroup(name: string): Either<void, EcmError> {
		const id = this.ctx.uuidGenerator.generate();
		const groupOrError = Group.make(id, name);

		if (groupOrError.error) {
			return error(groupOrError.error);
		}

		this.ctx.groupRepository.addOrReplace(groupOrError.success as Group);

		return success(undefined);
	}
	constructor(private readonly ctx: AuthServiceContext) {}

	createUser(email: string, fullname: string): Either<void, EcmError> {
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
			emailOrError.success as Email,
			fullnameOrError.success as Fullname,
			passwordOrError.success as Password,
		);

		this.ctx.userRepository.addOrReplace(user);

		this.ctx.emailSender.send(user.email, user.fullname, plainPassword);

		DomainEvents.notify(new UserCreatedEvent(user.email.value, user.fullname.value));

		return success(undefined);
	}
}
