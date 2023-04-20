import { Context } from "../../../deps.ts";
import { AuthContextProvider } from "../../application/auth_provider.ts";
import { Anonymous } from "../../application/builtin_users/anonymous.ts";
import { UserPrincipal } from "../../domain/auth/user_principal.ts";

export class OakAuthRequestProvider implements AuthContextProvider {
  constructor(private ctx: Context) {}

  getPrincipal(): UserPrincipal {
    return this.ctx.state.userPrincipal || Anonymous;
  }
}
