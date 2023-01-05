import { UserPrincipal } from "/domain/auth/user_principal.ts";

export interface AuthContextProvider {
  getPrincipal(): UserPrincipal;
}

export class UnAuthenticatedError extends Error {
  constructor() {
    super("Unauthenticated");
  }
}
