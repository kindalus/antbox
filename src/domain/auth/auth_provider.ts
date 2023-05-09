import { UserPrincipal } from "./user_principal.ts";

export interface AuthContextProvider {
  readonly principal: UserPrincipal;
  readonly mode: "Direct" | "Action";
}

export class UnAuthenticatedError extends Error {
  constructor() {
    super("Unauthenticated");
  }
}
