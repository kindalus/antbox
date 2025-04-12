import { type AuthenticationContext } from "application/authentication_context.ts";
import { Users } from "domain/users_groups/users.ts";

export function getAuthenticationContext(req: Request): AuthenticationContext {
  const principalHeader = req.headers.get("X-Principal");

  return {
    principal: principalHeader
      ? JSON.parse(principalHeader)
      : { email: Users.ANONYMOUS_USER_EMAIL, groups: [] },
    tenant: req.headers.get("X-Tenant") ?? "default",
    mode: "Direct",
  };
}
