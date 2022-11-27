import { UserPrincipal } from "/domain/auth/user_principal.ts";
import { Role } from "../../domain/auth/role.ts";
import { Context } from "/deps/oak";

export function getRequestContext(_ctx: Context): UserPrincipal {
  return {
    username: "System",
    roles: [Role.ActionsAdmin, Role.AspectsAdmin, Role.Admin],
  } as UserPrincipal;
}
