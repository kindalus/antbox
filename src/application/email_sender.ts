import { Password } from "/domain/auth/password.ts";
import { Email } from "/domain/auth/email.ts";
import { Fullname } from "/domain/auth/fullname.ts";

export interface EmailSender {
  send(email: Email, fullname: Fullname, password: Password): void;
}
