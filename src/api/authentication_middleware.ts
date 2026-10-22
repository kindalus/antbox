import type { Principal } from "application/security/authentication_context.ts";
import type { ApiKeysService } from "application/security/api_keys_service.ts";
import type { ExternalLoginService } from "application/security/external_login_service.ts";
import { Groups } from "domain/users_groups/groups.ts";
import { Users } from "domain/users_groups/users.ts";
import { type Either, left, right } from "shared/either.ts";
import type { AntboxTenant } from "./antbox_tenant.ts";
import { getQuery } from "./get_query.ts";
import { bindRequestTenant, resolveTenant } from "./get_tenant.ts";
import type { HttpHandler } from "./handler.ts";
import type { HttpMiddleware } from "./middleware.ts";
import { decodeJwt, jwtVerify, type KeyObject } from "jose";

export function authenticationMiddleware(
	tenants: AntboxTenant[],
): HttpMiddleware {
	return (handler: HttpHandler) => {
		const next: HttpHandler = async (req) => {
			const response = await handler(req);
			response.headers.append("Vary", "Authorization, Cookie, Origin, Sec-Fetch-Site, X-Tenant");
			return response;
		};
		return async (req: Request) => {
			const tenant = resolveTenant(req, tenants);
			if (!tenant) {
				return new Response(JSON.stringify({ message: "Tenant not found" }), {
					status: 400,
					headers: { "Content-Type": "application/json" },
				});
			}
			req.headers.set("X-Tenant", tenant.name);
			// A reload may replace the registry while authentication is awaiting a repository.
			bindRequestTenant(req, tenant);

			const secret = importKey(tenant.symmetricKey);
			const apiKeysService = tenant.apiKeysService;
			const externalLoginService = tenant.externalLoginService;

			if (!apiKeysService || !externalLoginService || !tenant.symmetricKey) {
				storeAnonymous(req);
				return next(req);
			}

			const apiKey = getApiKey(req);
			if (apiKey) {
				await authenticateApiKey(apiKeysService, req, apiKey);
				return next(req);
			}

			const token = getToken(req);
			if (!token) {
				storeAnonymous(req);
				return next(req);
			}

			let payload;
			try {
				payload = decodeJwt(token);
			} catch {
				storeAnonymous(req);
				return next(req);
			}

			if (payload.iss === "urn:antbox") {
				await authenticateRoot(secret, req, token, tenant.name);
				return next(req);
			}

			await authenticateToken(externalLoginService, req, token);
			return next(req);
		};
	};
}

function getToken(req: Request) {
	// Priority 3: Authorization: Bearer <token>
	const bearer = req.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i);
	if (bearer) {
		return bearer[1];
	}

	// Browser metadata survives TLS termination without trusting forwarded host headers.
	const fetchSite = req.headers.get("sec-fetch-site");
	const origin = req.headers.get("origin");
	if (
		fetchSite === "same-site" || fetchSite === "cross-site" ||
		(fetchSite !== "same-origin" && origin && origin !== new URL(req.url).origin)
	) {
		return undefined;
	}

	// Priority 4: Cookie: token=<jwt>
	const cookieHeader = req.headers.get("cookie");
	if (cookieHeader) {
		const match = cookieHeader.match(/(?:^|;\s*)token=([^;]+)/);
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

function storePrincipal(req: Request, email: string, groups: string[], apiKeyUuid?: string) {
	const principal: Principal = {
		email,
		groups,
		...(apiKeyUuid === undefined ? {} : { apiKeyUuid }),
	};

	req.headers.set("X-Principal", JSON.stringify(principal));
}

async function authenticateRoot(
	secret: Uint8Array,
	req: Request,
	token: string,
	tenantName: string,
) {
	const tokenOrErr = await verifyToken(secret, token, tenantName);

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

	return storePrincipal(
		req,
		Users.API_KEY_USER_EMAIL,
		[apiKeyOrErr.value.group],
		apiKeyOrErr.value.uuid,
	);
}

async function authenticateToken(
	externalLoginService: ExternalLoginService,
	req: Request,
	token: string,
) {
	const userOrErr = await externalLoginService.resolvePrincipal(token);
	if (userOrErr.isLeft()) {
		return storeAnonymous(req);
	}
	const groups = [userOrErr.value.group, ...userOrErr.value.groups];
	storePrincipal(req, userOrErr.value.email, groups);
}

function verifyToken(
	key: KeyObject | Uint8Array,
	token: string,
	tenantName: string,
): Promise<Either<Error, { payload: Principal }>> {
	return jwtVerify(token, key, {
		algorithms: ["HS256"],
		issuer: "urn:antbox",
		audience: tenantName,
		requiredClaims: ["exp"],
	})
		.then((payload) => right(payload))
		.catch((e) => left(e)) as Promise<Either<Error, { payload: Principal }>>;
}

function importKey(key: string): Uint8Array {
	return new TextEncoder().encode(key as string);
}
