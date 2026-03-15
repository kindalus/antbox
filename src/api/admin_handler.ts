import { defaultMiddlewareChain } from "./default_middleware_chain.ts";
import { getAuthenticationContext } from "./get_authentication_context.ts";
import { type HttpHandler, sendBadRequest, sendForbidden, sendOK } from "./handler.ts";
import type { AntboxTenant } from "./antbox_tenant.ts";
import { Users } from "domain/users_groups/users.ts";
import { loadConfiguration } from "setup/load_configuration.ts";
import { saveTenantConfiguration } from "setup/save_configuration.ts";
import type { TenantConfiguration } from "api/http_server_configuration.ts";

export function adminRuntimeHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(tenants, (_req: Request): Promise<Response> => {
		const ctx = getAuthenticationContext(_req);
		if (ctx.principal.email !== Users.ROOT_USER_EMAIL) {
			return Promise.resolve(sendForbidden());
		}

		return Promise.resolve(sendOK({
			deno: Deno.version,
			memory: Deno.memoryUsage(),
			uptime: Deno.uptime(),
			tenants: tenants.map((t) => t.name),
		}));
	});
}

export function adminReloadHandler(
	tenants: AntboxTenant[],
	reload: () => Promise<void>,
): HttpHandler {
	return defaultMiddlewareChain(tenants, async (_req: Request): Promise<Response> => {
		const ctx = getAuthenticationContext(_req);
		if (ctx.principal.email !== Users.ROOT_USER_EMAIL) {
			return sendForbidden();
		}

		await reload();
		return sendOK({ reloaded: true });
	});
}

export function adminTenantsGetHandler(
	tenants: AntboxTenant[],
	configDir?: string,
): HttpHandler {
	return defaultMiddlewareChain(tenants, async (_req: Request): Promise<Response> => {
		const ctx = getAuthenticationContext(_req);
		if (ctx.principal.email !== Users.ROOT_USER_EMAIL) {
			return sendForbidden();
		}

		const config = await loadConfiguration(configDir);
		return sendOK(config.tenants);
	});
}

export function adminTenantsUpdateHandler(
	tenants: AntboxTenant[],
	reload: () => Promise<void>,
	configDir?: string,
): HttpHandler {
	return defaultMiddlewareChain(tenants, async (req: Request): Promise<Response> => {
		const ctx = getAuthenticationContext(req);
		if (ctx.principal.email !== Users.ROOT_USER_EMAIL) {
			return sendForbidden();
		}

		const body = await req.json() as TenantConfiguration[];
		if (!Array.isArray(body) || body.length === 0) {
			return sendBadRequest({ error: "tenants must be a non-empty array" });
		}

		await saveTenantConfiguration(configDir, body);
		await reload();
		return sendOK({ updated: true });
	});
}
