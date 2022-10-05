import { Email } from "./email.ts";
import { Fullname } from "./fullname.ts";
import { Password } from "./password.ts";

export class User {
  readonly email: Email;
  private _fullname: Fullname;
  private _password: Password;

  get fullname() {
    return this._fullname;
  }

  get password() {
    return this._password;
  }

  constructor(email: Email, fullname: Fullname, password: Password) {
    this.email = email;
    this._fullname = fullname;
    this._password = password;
  }

  getPrincipalName(): string {
    return this.email.value;
  }
}
