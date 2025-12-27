import { ApiKeysService } from "application/api_keys_service.ts";
import { UsersService } from "application/users_service.ts";
import type { AuthenticationContext, Principal } from "application/authentication_context.ts";
import { Groups } from "domain/users_groups/groups.ts";
import { Users } from "domain/users_groups/users.ts";
import { type Either, left, right } from "shared/either.ts";
import type { AntboxTenant } from "./antbox_tenant.ts";
import { getQuery } from "./get_query.ts";
import { getTenant } from "./get_tenant.ts";
import type { HttpHandler } from "./handler.ts";
import type { HttpMiddleware } from "./middleware.ts";
import { decodeJwt, importJWK, type JWK, jwtVerify, type KeyObject } from "jose";

export function authenticationMiddleware(
	tenants: AntboxTenant[],
): HttpMiddleware {
	return (next: HttpHandler) => {
		const jwks = new Map<string, KeyObject | Uint8Array>();
		const secrets = new Map<string, Uint8Array>();
		const usersServices = new Map<string, UsersService>();
		const apiKeysServices = new Map<string, ApiKeysService>();

		tenants.forEach(async (tenant) => {
			const jwkOrErr = await importJwkKey(tenant.rawJwk as unknown as JWK);

			if (jwkOrErr.isLeft()) {
				throw jwkOrErr.value;
			}

			const jwk = jwkOrErr.value;
			const secret = importKey(tenant.symmetricKey);

			jwks.set(tenant.name, jwk);
			secrets.set(tenant.name, secret);
			usersServices.set(tenant.name, tenant.usersService);
			apiKeysServices.set(tenant.name, tenant.apiKeysService);
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

			const usersService = usersServices.get(tenantName)!;
			const jwk = jwks.get(tenantName)!;
			await authenticateToken(jwk, usersService, req, token);
			return next(req);
		};
	};
}

function getToken(req: Request) {
	// Priority 2: Authorization: Bearer <token>
	const bearer = req.headers.get("authorization");
	if (bearer && /Bearer\s.*/.test(bearer)) {
		return bearer.split(" ")[1];
	}

	// Priority 3: Cookie: token=<jwt>
	const cookieHeader = req.headers.get("cookie");
	if (cookieHeader) {
		const match = cookieHeader.match(/\btoken=([^;]+)/);
		if (match) {
			return match[1];
		}
	}

	return undefined;
}

function getApiKey(req: Request) {
	// Check Authorization header first (standard practice)
	const authHeader = req.headers.get("authorization");
	if (authHeader) {
		// Match "ApiKey <key>" format (case-insensitive)
		const match = authHeader.match(/^apikey\s+(.+)$/i);
		if (match) {
			return match[1];
		}
	}

	// Fall back to query parameter
	const query = getQuery(req);
	return query["api_key"];
}

function storeAnonymous(req: Request) {
	return storePrincipal(req, Users.ANONYMOUS_USER_EMAIL, [Groups.ANONYMOUS_GROUP_UUID]);
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

	return storePrincipal(req, Users.ROOT_USER_EMAIL, [Groups.ADMINS_GROUP_UUID]);
}

async function authenticateApiKey(
	apiKeysService: ApiKeysService,
	req: Request,
	apiKey: string,
) {
	const apiKeyOrErr = await apiKeysService.getApiKeyBySecret(apiKey);
	if (apiKeyOrErr.isLeft()) {
		return storeAnonymous(req);
	}

	return storePrincipal(req, Users.API_KEY_USER_EMAIL, [apiKeyOrErr.value.group]);
}

async function authenticateToken(
	jwk: KeyObject | Uint8Array,
	usersService: UsersService,
	req: Request,
	token: string,
) {
	const tokenOrErr = await verifyToken(jwk, token);
	if (tokenOrErr.isLeft()) {
		return storeAnonymous(req);
	}

	// TODO: Fix this - use elevated context
	const userOrErr = await usersService.getUser(
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
