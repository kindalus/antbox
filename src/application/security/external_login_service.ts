import {
	createLocalJWKSet,
	createRemoteJWKSet,
	decodeJwt,
	type JSONWebKeySet,
	type JWTPayload,
	jwtVerify,
} from "jose";

import type { UserData } from "domain/configuration/user_data.ts";
import { type AntboxError, BadRequestError, UnauthorizedError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import { Logger } from "shared/logger.ts";
import { UsersService } from "./users_service.ts";

export interface ExternalLoginResult {
	readonly email: string;
	readonly name: string;
	readonly groups: string[];
}

interface ExternalIdentity {
	readonly email?: string;
	readonly phone?: string;
}

export type ExternalJwksSource =
	| { readonly type: "remote"; readonly url: string }
	| { readonly type: "local"; readonly jwks: JSONWebKeySet };

export class ExternalLoginService {
	readonly #jwks: ReturnType<typeof createRemoteJWKSet> | ReturnType<typeof createLocalJWKSet>;

	constructor(
		private readonly usersService: UsersService,
		source: ExternalJwksSource,
	) {
		this.#jwks = source.type === "remote"
			? createRemoteJWKSet(new URL(source.url))
			: createLocalJWKSet(source.jwks);
	}

	async challenge(token: string): Promise<Either<AntboxError, void>> {
		const userOrErr = await this.#resolveUserFromToken(token);
		if (userOrErr.isLeft()) {
			return left(userOrErr.value);
		}

		return right(undefined);
	}

	async login(token: string): Promise<Either<AntboxError, ExternalLoginResult>> {
		const userOrErr = await this.#resolveUserFromToken(token);
		if (userOrErr.isLeft()) {
			return left(userOrErr.value);
		}

		return right({
			email: userOrErr.value.email,
			name: userOrErr.value.title,
			groups: [userOrErr.value.group, ...userOrErr.value.groups],
		});
	}

	async resolvePrincipal(token: string): Promise<Either<AntboxError, UserData>> {
		return this.#resolveUserFromToken(token);
	}

	async #resolveUserFromToken(token: string): Promise<Either<AntboxError, UserData>> {
		const claimsOrErr = await this.#verifyExternalJwt(token);
		if (claimsOrErr.isLeft()) {
			return left(claimsOrErr.value);
		}

		const userOrErr = await this.usersService.findUserForAuthentication(claimsOrErr.value);
		if (userOrErr.isLeft()) {
			return left(userOrErr.value);
		}

		return userOrErr;
	}

	async #verifyExternalJwt(token: string): Promise<Either<AntboxError, ExternalIdentity>> {
		const decoded = decodeJwtSafe(token);
		if (decoded.isLeft()) {
			return left(decoded.value);
		}

		if (decoded.value.iss === "urn:antbox") {
			return left(new UnauthorizedError());
		}

		const verification = await verifyToken(this.#jwks, token);
		if (verification.isLeft()) {
			Logger.warn("External token JWT verification failed", {
				issuer: decoded.value.iss,
				error: verification.value.message,
			});
			return left(new UnauthorizedError());
		}

		const identity = extractIdentity(verification.value.payload);
		if (!identity.email && !identity.phone) {
			return left(new BadRequestError("JWT must contain email or phone number claim"));
		}

		return right(identity);
	}
}

function extractIdentity(payload: JWTPayload): ExternalIdentity {
	const email = typeof payload.email === "string" ? payload.email : undefined;
	const phoneNumber = typeof payload.phone_number === "string" ? payload.phone_number : undefined;
	const phone = typeof payload.phone === "string" ? payload.phone : undefined;

	return {
		email,
		phone: email ? undefined : phoneNumber ?? phone,
	};
}

function decodeJwtSafe(token: string): Either<AntboxError, JWTPayload> {
	try {
		return right(decodeJwt(token));
	} catch {
		return left(new UnauthorizedError());
	}
}

function verifyToken(
	jwks: ReturnType<typeof createRemoteJWKSet> | ReturnType<typeof createLocalJWKSet>,
	token: string,
): Promise<Either<Error, { payload: JWTPayload }>> {
	return jwtVerify(token, jwks)
		.then((payload) => right(payload))
		.catch((error) => left(error)) as Promise<Either<Error, { payload: JWTPayload }>>;
}
