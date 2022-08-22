import { UserPrincipal } from "../../application/user_principal.ts";
export interface HttpRequest<T> {
  payload: T;
  userPrincipal: UserPrincipal;
}
