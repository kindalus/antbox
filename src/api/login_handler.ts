import * as jose from "jose";
import { readTextStream } from "shared/readers.ts";
import type { AntboxTenant } from "./antbox_tenant.ts";
import { defaultMiddlewareChain } from "./default_middleware_chain.ts";
import { getAuthenticationContext } from "./get_authentication_context.ts";
import { getTenant } from "./get_tenant.ts";
import { type HttpHandler, sendOK, sendUnauthorized } from "./handler.ts";

import { ROOT_USER } from "application/builtin_users/index.ts";
import { ADMINS_GROUP } from "application/builtin_groups/index.ts";
import { Users } from "domain/users_groups/users.ts";

export function rootHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const tenant = getTenant(req, tenants);
			const symmetricKey = tenant.symmetricKey;
			const rootPasswd = tenant.rootPasswd;
			const digestedRootPasswd = await sha256(rootPasswd);

			if (!req.body) {
				return sendUnauthorized();
			}

			const passwd = await readTextStream(req.body);
			if (passwd !== digestedRootPasswd) {
				return sendUnauthorized();
			}

			const secret = new TextEncoder().encode(symmetricKey);

			const jwt = await new jose.SignJWT({ email: ROOT_USER.email, groups: [ADMINS_GROUP.uuid] })
				.setProtectedHeader({ alg: "HS256" })
				.setIssuedAt()
				.setIssuer("urn:antbox")
				.setExpirationTime("4h")
				.sign(secret);

			const response = sendOK({ jwt });

			// Set cookie with same expiration as JWT (4 hours = 14400 seconds)
			// SameSite=Strict provides CSRF protection for same-origin requests
			response.headers.set(
				"Set-Cookie",
				`token=${jwt}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=14400`,
			);

			return response;
		},
	);
}

export function logoutHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (_req: Request): Promise<Response> => {
			const response = sendOK({ message: "Logged out successfully" });

			// Clear the authentication cookie by setting Max-Age=0
			response.headers.set(
				"Set-Cookie",
				"token=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0",
			);

			return response;
		},
	);
}

export function meHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const tenant = getTenant(req, tenants);
			const ctx = getAuthenticationContext(req);

			if (
				!ctx.principal?.email ||
				ctx.principal.email === Users.ANONYMOUS_USER_EMAIL
			) {
				return sendUnauthorized();
			}

			const userOrErr = await tenant.usersGroupsService.getUser(
				ctx,
				ctx.principal.email,
			);

			if (userOrErr.isLeft()) {
				return sendUnauthorized();
			}

			const { email, name, groups } = userOrErr.value;

			return sendOK({ email, name, groups });
		},
	);
}

async function sha256(str: string) {
	const strAsBuffer = new TextEncoder().encode(str);
	const hashBuffer = await crypto.subtle.digest("SHA-256", strAsBuffer);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
