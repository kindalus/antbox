import PasswordGenerator from "../domain/auth/password_generator.ts";
import EmailSender from "./email_sender.ts";
import EcmError from "../shared/ecm_error.ts";
import Either, { error, success } from "../shared/either.ts";
import Email from "../domain/auth/email.ts";
import Fullname from "../domain/auth/fullname.ts";
import User from "../domain/auth/user.ts";
import Password from "../domain/auth/password.ts";
import UserRepository from "../domain/auth/user_repository.ts";

export interface AuthServiceContext {
	passwordGenerator: PasswordGenerator;
	emailSender: EmailSender;
	userRepository: UserRepository;
}

export default class AuthService {
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

		return success(undefined);
	}
}
