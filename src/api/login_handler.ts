import * as jose from "jose";
import { readTextStream } from "shared/readers.ts";
import type { AntboxTenant } from "./antbox_tenant.ts";
import { defaultMiddlewareChain } from "./default_middleware_chain.ts";
import { getTenant } from "./get_tenant.ts";
import { type HttpHandler, sendOK, sendUnauthorized } from "./handler.ts";

import { ROOT_USER } from "application/builtin_users/index.ts";

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

			const jwt = await new jose.SignJWT({ email: ROOT_USER.email })
				.setProtectedHeader({ alg: "HS256" })
				.setIssuedAt()
				.setIssuer("urn:antbox")
				.setExpirationTime("4h")
				.sign(secret);

			return sendOK({ jwt });
		},
	);
}

async function sha256(str: string) {
	const strAsBuffer = new TextEncoder().encode(str);
	const hashBuffer = await crypto.subtle.digest("SHA-256", strAsBuffer);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
