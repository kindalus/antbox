import { UserPrincipal } from "/domain/auth/user_principal.ts";
import { Context } from "/deps/oak";
import {
  AuthContextProvider,
  UnAuthenticatedError,
} from "/application/auth_provider.ts";
import { Either, right } from "/shared/either.ts";

export class OakAuthRequestProvider implements AuthContextProvider {
  constructor(private ctx: Context) {}

  getPrincipal(): Either<UnAuthenticatedError, UserPrincipal> {
    return right({
      username: "System",
      group: "--system--",
      groups: [] as string[],
      fullname: "System",
    });
  }
}
