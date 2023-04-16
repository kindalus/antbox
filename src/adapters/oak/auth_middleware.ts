import { User } from "/domain/auth/user.ts";
import { Context } from "/deps/oak";
import * as jose from "/deps/jose";
import { AuthService } from "/application/auth_service.ts";
import { Either, left, right } from "../../shared/either.ts";
import { JWK, KeyLike } from "/deps/jose";
import { UserPrincipal } from "../../domain/auth/user_principal.ts";

export async function authMiddleware(
	authService: AuthService,
	key: Record<string, string>,
	secret: string,
): Promise<(ctx: Context, next: () => Promise<unknown>) => Promise<unknown>> {
	const jwkOrErr = await importJwk(key);

	if (jwkOrErr.isLeft()) {
		throw jwkOrErr.value;
	}

	const jwk = jwkOrErr.value;
	const skey = importKey(secret);

	return async (ctx: Context, next: () => Promise<unknown>) => {
		const token = await getToken(ctx);
		ctx.state.userPrincipal = User.ANONYMOUS_USER;

		if (!token) return await next();

		const payload = await jose.decodeJwt(token);
		if (!payload) return next();

		if (payload.iss === "urn:antbox") {
			await authenticateRoot(skey, ctx, token);
			return next();
		}

		await authenticateToken(jwk, authService, ctx, token);
		return next();
	};
}

async function getToken(ctx: Context) {
	return ctx.request.headers.get("x-access-token") ??
		(await ctx.cookies.get("antbox-access-token"));
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

	ctx.state.userPrincipal = User.ROOT_USER;
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

	const userOrErr = await authService.getUserByEmail(tokenOrErr.value.email);
	if (userOrErr.isLeft()) {
		return;
	}

	ctx.state.userPrincipal = userToPrincipal(userOrErr.value);
}

function verifyToken(key: KeyLike | Uint8Array, token: string): Promise<Either<Error, UserPrincipal>> {
	return jose.jwtVerify(token, key).then((payload) => right(payload))
		.catch((e) => left(e)) as Promise<Either<Error, UserPrincipal>>;
}

function importJwk(key: JWK): Promise<Either<TypeError, KeyLike | Uint8Array>> {
	return jose.importJWK(key)
		.then((jwk) => right(jwk))
		.catch((e) => left(e)) as Promise<Either<TypeError, KeyLike | Uint8Array>>;
}

function importKey(key: string): Uint8Array {
	return new TextEncoder().encode(key as string);
}

function userToPrincipal(user: User): UserPrincipal {
	return {
		email: user.email,
		fullname: user.fullname,
		group: user.group,
		groups: user.groups,
	} as UserPrincipal;
}
