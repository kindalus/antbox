import { UserPrincipal } from "/domain/auth/user_principal.ts";
import { Context } from "/deps/oak";
import { AuthContextProvider } from "/application/auth_provider.ts";
import { User } from "../../domain/auth/user.ts";

export class OakAuthRequestProvider implements AuthContextProvider {
  constructor(private ctx: Context) {}

  getPrincipal(): UserPrincipal {
    return this.ctx.state.userPrincipal || User.ANONYMOUS_USER;
  }
}
