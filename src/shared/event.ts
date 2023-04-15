import { UserPrincipal } from "../domain/auth/user_principal.ts";

export interface Event {
  readonly eventId: string;
  readonly occurredOn: Date;
  readonly payload: unknown;
  readonly userEmail: string;
}
