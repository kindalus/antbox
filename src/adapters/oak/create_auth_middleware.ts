import { Context, getQuery, jose, JWK, KeyLike } from "../../../deps.ts";
import { ApiKeyService } from "../../application/api_keys_service.ts";
import { AuthService } from "../../application/auth_service.ts";
import { Anonymous } from "../../application/builtin_users/anonymous.ts";
import { Root } from "../../application/builtin_users/root.ts";
import { User } from "../../domain/auth/user.ts";
import { Either, left, right } from "../../shared/either.ts";
import { getTenant } from "./get_tenant.ts";
import { AntboxTenant } from "./setup_oak_server.ts";

interface UserPrincipal {
	email: string;
}

export async function createAuthMiddleware(
	tenants: AntboxTenant[],
): Promise<(ctx: Context, next: () => Promise<unknown>) => Promise<unknown>> {
	const jwks = new Map<string, KeyLike | Uint8Array>();
	const secrets = new Map<string, Uint8Array>();
	const authServices = new Map<string, AuthService>();
	const apiKeysServices = new Map<string, ApiKeyService>();

	await tenants.forEach(async (tenant) => {
		const jwkOrErr = await importJwk(tenant.rawJwk);

		if (jwkOrErr.isLeft()) {
			throw jwkOrErr.value;
		}

		const jwk = jwkOrErr.value;
		const secret = importKey(tenant.symmetricKey);

		jwks.set(tenant.name, jwk);
		secrets.set(tenant.name, secret);
		authServices.set(tenant.name, tenant.service.authService);
		apiKeysServices.set(tenant.name, tenant.service.apiKeysService);
	});

	return async (ctx: Context, next: () => Promise<unknown>) => {
		const tenantName = getTenant(ctx, tenants).name;

		ctx.state.user = Anonymous;

		const apiKey = getApiKey(ctx);
		if (apiKey) {
			const apiKeysService = apiKeysServices.get(tenantName);
			await authenticateApiKey(apiKeysService!, ctx, apiKey);
			return next();
		}

		const token = getToken(ctx);
		if (!token) return await next();

		const payload = await jose.decodeJwt(token);
		if (!payload) return next();

		if (payload.iss === "urn:antbox") {
			const secret = secrets.get(tenantName)!;
			await authenticateRoot(secret, ctx, token);
			return next();
		}

		const authService = authServices.get(tenantName)!;
		const jwk = jwks.get(tenantName)!;
		await authenticateToken(jwk, authService, ctx, token);
		return next();
	};
}

function getToken(ctx: Context) {
	return ctx.request.headers.get("x-access-token");
}

function getApiKey(ctx: Context) {
	const query = getQuery(ctx);
	return query["api-key"];
}

async function authenticateRoot(
	secret: Uint8Array,
	ctx: Context,
	token: string,
) {
	const tokenOrErr = await verifyToken(secret, token);

	if (tokenOrErr.isLeft()) {
		return;
	}

	ctx.state.user = Root;
}

async function authenticateApiKey(
	apiKeysService: ApiKeyService,
	ctx: Context,
	apiKey: string,
) {
	const apiKeyOrErr = await apiKeysService.getBySecret(apiKey);
	if (apiKeyOrErr.isLeft()) {
		return;
	}

	ctx.state.user = Object.assign(new User(), Anonymous, {
		group: apiKeyOrErr.value.group,
	});
}

async function authenticateToken(
	jwk: KeyLike | Uint8Array,
	authService: AuthService,
	ctx: Context,
	token: string,
) {
	const tokenOrErr = await verifyToken(jwk, token);
	if (tokenOrErr.isLeft()) {
		return;
	}

	const userOrErr = await authService.getUserByEmail(tokenOrErr.value.payload.email);
	if (userOrErr.isLeft()) {
		return;
	}

	ctx.state.user = userOrErr.value;
}

function verifyToken(
	key: KeyLike | Uint8Array,
	token: string,
): Promise<Either<Error, { payload: UserPrincipal }>> {
	return jose
		.jwtVerify(token, key)
		.then((payload) => right(payload))
		.catch((e) => left(e)) as Promise<Either<Error, { payload: UserPrincipal }>>;
}

function importJwk(key: JWK): Promise<Either<TypeError, KeyLike | Uint8Array>> {
	return jose
		.importJWK(key)
		.then((jwk) => right(jwk))
		.catch((e) => left(e)) as Promise<Either<TypeError, KeyLike | Uint8Array>>;
}

function importKey(key: string): Uint8Array {
	return new TextEncoder().encode(key as string);
}
