import { Users } from "domain/users_groups/users.ts";
import { sendUnauthorized } from "./handler.ts";
import type { HttpHandler } from "./handler.ts";
import type { HttpMiddleware } from "./middleware.ts";

const BEARER_HEADER_REGEX = /^Bearer\s+\S+$/i;

/**
 * MCP authentication entry gate.
 *
 * MCP requests must always provide a bearer token in Authorization header.
 * API key and cookie authentication paths are intentionally not supported here.
 */
export const requireBearerTokenMiddleware: HttpMiddleware =
	(next: HttpHandler) => async (req: Request) => {
		const authorization = req.headers.get("authorization");
		if (!authorization || !BEARER_HEADER_REGEX.test(authorization)) {
			return sendUnauthorized({
				errorCode: "UnauthorizedError",
				message: "MCP requires Authorization: Bearer <jwt>",
			});
		}

		return next(req);
	};

/**
 * Reject unauthenticated principals after token validation middleware runs.
 */
export const requireAuthenticatedPrincipalMiddleware: HttpMiddleware =
	(next: HttpHandler) => async (req: Request) => {
		const principalHeader = req.headers.get("X-Principal");
		if (!principalHeader) {
			return sendUnauthorized({
				errorCode: "UnauthorizedError",
				message: "MCP bearer token is invalid or expired",
			});
		}

		try {
			const principal = JSON.parse(principalHeader) as { email?: string };
			if (!principal.email || principal.email === Users.ANONYMOUS_USER_EMAIL) {
				return sendUnauthorized({
					errorCode: "UnauthorizedError",
					message: "MCP bearer token is invalid or expired",
				});
			}
		} catch {
			return sendUnauthorized({
				errorCode: "UnauthorizedError",
				message: "MCP bearer token is invalid or expired",
			});
		}

		return next(req);
	};
