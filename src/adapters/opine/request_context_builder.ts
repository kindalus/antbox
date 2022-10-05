import { UserPrincipal } from "/domain/auth/user_principal.ts";
import { OpineRequest } from "/deps/opine";

export function getRequestContext(_req: OpineRequest): UserPrincipal {
  return {
    username: "System",
  } as UserPrincipal;
}
