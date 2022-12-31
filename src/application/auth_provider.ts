import { UserPrincipal } from "/domain/auth/user_principal.ts";
import { Either } from "/shared/either.ts";

export interface AuthContextProvider {
  getPrincipal(): Either<UnAuthenticatedError, UserPrincipal>;
}

export class UnAuthenticatedError extends Error {
  constructor() {
    super("Unauthenticated");
  }
}
