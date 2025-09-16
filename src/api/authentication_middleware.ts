import { ApiKeyService } from "application/api_key_service.ts";
import { UsersGroupsService } from "application/users_groups_service.ts";
import type {
  AuthenticationContext,
  Principal,
} from "application/authentication_context.ts";
import { Groups } from "domain/users_groups/groups.ts";
import { Users } from "domain/users_groups/users.ts";
import { type Either, left, right } from "shared/either.ts";
import type { AntboxTenant } from "./antbox_tenant.ts";
import { getQuery } from "./get_query.ts";
import { getTenant } from "./get_tenant.ts";
import type { HttpHandler } from "./handler.ts";
import type { HttpMiddleware } from "./middleware.ts";
import {
  decodeJwt,
  importJWK,
  type JWK,
  jwtVerify,
  type KeyObject,
} from "jose";

export function authenticationMiddleware(
  tenants: AntboxTenant[],
): HttpMiddleware {
  return (next: HttpHandler) => {
    const jwks = new Map<string, KeyObject | Uint8Array>();
    const secrets = new Map<string, Uint8Array>();
    const authServices = new Map<string, UsersGroupsService>();
    const apiKeysServices = new Map<string, ApiKeyService>();

    tenants.forEach(async (tenant) => {
      const jwkOrErr = await importJwkKey(tenant.rawJwk as unknown as JWK);

      if (jwkOrErr.isLeft()) {
        throw jwkOrErr.value;
      }

      const jwk = jwkOrErr.value;
      const secret = importKey(tenant.symmetricKey);

      jwks.set(tenant.name, jwk);
      secrets.set(tenant.name, secret);
      // authServices.set(tenant.name, tenant.service.authService);
      // apiKeysServices.set(tenant.name, tenant.service.apiKeysService);
    });

    return async (req: Request) => {
      const tenantName = getTenant(req, tenants).name;

      const apiKey = getApiKey(req);
      if (apiKey) {
        const apiKeysService = apiKeysServices.get(tenantName);
        await authenticateApiKey(apiKeysService!, req, apiKey);
        return next(req);
      }

      const token = getToken(req);
      if (!token) {
        storeAnonymous(req);
        return next(req);
      }

      const payload = decodeJwt(token);
      if (!payload) {
        storeAnonymous(req);
        return next(req);
      }

      if (payload.iss === "urn:antbox") {
        const secret = secrets.get(tenantName)!;
        await authenticateRoot(secret, req, token);
        return next(req);
      }

      const authService = authServices.get(tenantName)!;
      const jwk = jwks.get(tenantName)!;
      await authenticateToken(jwk, authService, req, token);
      return next(req);
    };
  };
}

function getToken(req: Request) {
  const bearer = req.headers.get("authorization");

  if (bearer && /Bearer\s.*/.test(bearer)) {
    return bearer.split(" ")[1];
  }
  return req.headers.get("x-access-token");
}

function getApiKey(req: Request) {
  const query = getQuery(req);
  return query["x-api-key"] ?? req.headers.get("x-api-key");
}

function storeAnonymous(req: Request) {
  return storePrincipal(req, Users.ANONYMOUS_USER_EMAIL, []);
}

function storePrincipal(req: Request, email: string, groups: string[]) {
  const principal: Principal = {
    email,
    groups,
  };

  req.headers.set("X-Principal", JSON.stringify(principal));
}

async function authenticateRoot(
  secret: Uint8Array,
  req: Request,
  token: string,
) {
  const tokenOrErr = await verifyToken(secret, token);

  if (tokenOrErr.isLeft()) {
    return storeAnonymous(req);
  }

  storePrincipal(req, Users.ROOT_USER_EMAIL, [Groups.ADMINS_GROUP_UUID]);
}

async function authenticateApiKey(
  apiKeysService: ApiKeyService,
  req: Request,
  apiKey: string,
) {
  const apiKeyOrErr = await apiKeysService.getBySecret(apiKey);
  if (apiKeyOrErr.isLeft()) {
    return storeAnonymous(req);
  }

  storePrincipal(req, Users.ROOT_USER_EMAIL, [apiKeyOrErr.value.group]);
}

async function authenticateToken(
  jwk: KeyObject | Uint8Array,
  authService: UsersGroupsService,
  req: Request,
  token: string,
) {
  const tokenOrErr = await verifyToken(jwk, token);
  if (tokenOrErr.isLeft()) {
    return storeAnonymous(req);
  }

  // TODO: Fix this
  const userOrErr = await authService.getUser(
    undefined as unknown as AuthenticationContext,
    tokenOrErr.value.payload.email,
  );
  if (userOrErr.isLeft()) {
    return storeAnonymous(req);
  }

  storePrincipal(req, userOrErr.value.email, userOrErr.value.groups);
}

function verifyToken(
  key: KeyObject | Uint8Array,
  token: string,
): Promise<Either<Error, { payload: Principal }>> {
  return jwtVerify(token, key)
    .then((payload) => right(payload))
    .catch((e) => left(e)) as Promise<Either<Error, { payload: Principal }>>;
}

function importJwkKey(
  key: JWK,
): Promise<Either<TypeError, KeyObject | Uint8Array>> {
  return importJWK(key)
    .then((jwk) => right(jwk))
    .catch((e) => left(e)) as Promise<
      Either<TypeError, KeyObject | Uint8Array>
    >;
}

function importKey(key: string): Uint8Array {
  return new TextEncoder().encode(key as string);
}
