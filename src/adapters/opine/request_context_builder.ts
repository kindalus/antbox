import { UserPrincipal } from "/domain/auth/user_principal.ts";
import { OpineRequest } from "/deps/opine";
import { Role } from "../../domain/auth/role.ts";

export function getRequestContext(_req: OpineRequest): UserPrincipal {
  return {
    username: "System",
    roles: [Role.ActionsAdmin, Role.AspectsAdmin, Role.Admin],
  } as UserPrincipal;
}
