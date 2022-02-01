import Email from "./email.ts";
import Fullname from "./fullname.ts";

export default interface EmailSender {
	send(email: Email, fullname: Fullname, password: string): void;
}
