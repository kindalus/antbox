import { Context } from "../../../deps.ts";
import { Anonymous } from "../../application/builtin_users/anonymous.ts";
import { AuthContextProvider } from "../../domain/auth/auth_provider.ts";
import { UserPrincipal } from "../../domain/auth/user_principal.ts";

export class OakAuthRequestProvider implements AuthContextProvider {
  constructor(private ctx: Context) {}

  getPrincipal(): UserPrincipal {
    return this.ctx.state.userPrincipal || Anonymous;
  }
}
