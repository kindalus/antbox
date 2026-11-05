import { Hono } from "hono";
import type { AntboxTenant } from "api/antbox_tenant.ts";
import {
	challengeHandler,
	externalLoginHandler,
	logoutHandler,
	meHandler,
	rootHandler,
} from "api/login_handler.ts";
import { adapt } from "./adapt.ts";

/**
 * Builds the login router for the Hono HTTP adapter.
 *
 * @remarks
 * External setup:
 * - Pass the configured tenant list (e.g., from `setupTenants`).
 * - Run Deno with `--allow-net` when serving HTTP.
 *
 * @example
 * const router = loginRouter(tenants);
 * app.route("/", router);
 */
export default function (tenants: AntboxTenant[]) {
	const loginRouter = new Hono();

	loginRouter.post("/challenge", adapt(challengeHandler(tenants)));
	loginRouter.post("/login", adapt(externalLoginHandler(tenants)));
	loginRouter.post("/login/root", adapt(rootHandler(tenants)));
	loginRouter.post("/login/logout", adapt(logoutHandler(tenants)));
	loginRouter.get("/login/me", adapt(meHandler(tenants)));

	return loginRouter;
}
