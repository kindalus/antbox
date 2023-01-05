export type AuthKeys = AuthKey[];

export interface AuthKey {
  provider: string;
  title: string;
  type: "Symmetric" | "SPKI" | "JWK";
  alg: "RS256" | "HS256";
  key: unknown;
}
