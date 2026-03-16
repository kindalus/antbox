import { defaultMiddlewareChain } from "./default_middleware_chain.ts";
import { getAuthenticationContext } from "./get_authentication_context.ts";
import {
	type HttpHandler,
	sendForbidden,
	sendInternalServerError,
	sendNotFound,
	sendOK,
	sendUnprocessableEntity,
} from "./handler.ts";
import type { AntboxTenant } from "./antbox_tenant.ts";
import { getTenant } from "./get_tenant.ts";
import { Users } from "domain/users_groups/users.ts";
import { loadConfiguration } from "setup/load_configuration.ts";
import { saveTenantConfiguration } from "setup/save_configuration.ts";
import { TenantsConfigurationSchema } from "api/http_server_configuration.ts";

export function adminRuntimeHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(tenants, (req: Request): Promise<Response> => {
		if (getTenant(req, tenants) !== tenants[0]) {
			return Promise.resolve(sendNotFound());
		}

		const ctx = getAuthenticationContext(req);
		if (ctx.principal.email !== Users.ROOT_USER_EMAIL) {
			return Promise.resolve(sendForbidden());
		}

		return Promise.resolve(sendOK({
			deno: Deno.version,
			memory: Deno.memoryUsage(),
			uptime: Deno.osUptime(),
			tenants: tenants.map((t) => t.name),
		}));
	});
}

export function adminReloadHandler(
	tenants: AntboxTenant[],
	reload: () => Promise<void>,
): HttpHandler {
	return defaultMiddlewareChain(tenants, async (req: Request): Promise<Response> => {
		if (getTenant(req, tenants) !== tenants[0]) {
			return sendNotFound();
		}

		const ctx = getAuthenticationContext(req);
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
	return defaultMiddlewareChain(tenants, async (req: Request): Promise<Response> => {
		if (getTenant(req, tenants) !== tenants[0]) {
			return sendNotFound();
		}

		const ctx = getAuthenticationContext(req);
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
		if (getTenant(req, tenants) !== tenants[0]) {
			return sendNotFound();
		}

		const ctx = getAuthenticationContext(req);
		if (ctx.principal.email !== Users.ROOT_USER_EMAIL) {
			return sendForbidden();
		}

		const body = await req.json();

		const validation = TenantsConfigurationSchema.safeParse(body);
		if (!validation.success) {
			return sendUnprocessableEntity({ errors: validation.error.flatten() });
		}

		const oldConfig = await loadConfiguration(configDir);

		await saveTenantConfiguration(configDir, validation.data);

		try {
			await reload();
		} catch (err) {
			await saveTenantConfiguration(configDir, oldConfig.tenants);
			return sendInternalServerError({ error: String(err) });
		}

		return sendOK({ updated: true });
	});
}
