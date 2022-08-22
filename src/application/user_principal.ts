import { Role } from "/domain/auth/role.ts";

export interface UserPrincipal {
  username: string;
  groups: string[];
  roles: Role[];
}
