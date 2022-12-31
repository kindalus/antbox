export interface UserPrincipal {
  readonly username: string;
  readonly fullname: string;
  readonly group: string;
  readonly groups: string[];
}
