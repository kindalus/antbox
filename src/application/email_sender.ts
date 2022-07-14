import Email from "/domain/auth/email.ts";
import Fullname from "/domain/auth/fullname.ts";

export default interface EmailSender {
	send(email: Email, fullname: Fullname, password: string): void;
}
