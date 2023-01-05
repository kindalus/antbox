export interface UserPrincipal {
  readonly email: string;
  readonly fullname: string;
  readonly group: string;
  readonly groups: string[];
}
