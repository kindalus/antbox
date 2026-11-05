import { join } from "node:path";
import process from "node:process";
import { openapiSpecHandler } from "api/docs_handlers.ts";
import { adapt } from "./adapt.ts";
import webdavRouter from "adapters/hono/webdav_router.ts";
import loginRouter from "adapters/hono/login_v2_router.ts";
import nodesRouter from "adapters/hono/nodes_v2_router.ts";
import aspectsRouter from "adapters/hono/aspects_v2_router.ts";
import featuresRouter from "adapters/hono/features_v2_router.ts";
import agentsRouter from "adapters/hono/agents_v2_router.ts";
import apiKeysRouter from "adapters/hono/api_keys_v2_router.ts";
import usersRouter from "adapters/hono/users_v2_router.ts";
import groupsRouter from "adapters/hono/groups_v2_router.ts";
import actionsRouter from "adapters/hono/actions_v2_router.ts";
import extensionsRouter from "adapters/hono/extensions_v2_router.ts";
import templatesRouter from "adapters/hono/templates_v2_router.ts";
import docsRouter from "adapters/hono/docs_v2_router.ts";
import mcpRouter from "adapters/hono/mcp_v2_router.ts";
import workflowsRouter from "adapters/hono/workflows_v2_router.ts";
import articlesRouter from "adapters/hono/articles_v2_router.ts";
import auditRouter from "adapters/hono/audit_v2_router.ts";
import notificationsRouter from "adapters/hono/notifications_v2_router.ts";
import userPreferencesRouter from "adapters/hono/user_preferences_v2_router.ts";
import heartbeatRouter from "adapters/hono/heartbeat_v2_router.ts";
import adminRouter from "adapters/hono/admin_v2_router.ts";
import metricsRouter from "adapters/hono/metrics_router.ts";

import type { AntboxTenant } from "api/antbox_tenant.ts";
import type { McpHttpOptions } from "api/http_server_configuration.ts";
import { Hono } from "hono";
import type { HttpServerOpts, startHttpServer } from "api/http_server.ts";
import { setServerHeader } from "shared/app_metadata.ts";
import { type ServeOptions, startServer } from "./serve.ts";

/**
 * Path used for route matching: lowercase and without a trailing slash, so that
 * `/V2/Nodes/` reaches the same route as `/v2/nodes`. Parameter values are read from the
 * original URL by `adapt`, so they keep their case.
 */
export function matchPath(request: Request): string {
	const url = request.url;
	const start = url.indexOf("/", url.indexOf("//") + 2);
	if (start < 0) return "/";
	let end = url.length;
	for (const mark of ["?", "#"]) {
		const index = url.indexOf(mark, start);
		if (index >= 0 && index < end) end = index;
	}
	const path = url.slice(start, end).toLowerCase();
	return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

/** Stamps the canonical Server header, whatever the response is (including 404 and 405). */
export function withServerHeader(response: Response): Response {
	try {
		setServerHeader(response.headers);
		return response;
	} catch {
		// Immutable headers (for example a response proxied from fetch).
		const copy = new Response(response.body, response);
		setServerHeader(copy.headers);
		return copy;
	}
}

const IMPLEMENTED_METHODS = new Set([
	"DELETE",
	"GET",
	"HEAD",
	"OPTIONS",
	"PATCH",
	"POST",
	"PUT",
	"PROPFIND",
	"PROPPATCH",
	"MKCOL",
	"COPY",
	"MOVE",
	"LOCK",
	"UNLOCK",
]);

function allowedMethods(app: Hono, path: string): string[] {
	const candidates = new Set<string>();
	for (const route of app.routes) {
		if (route.method !== "ALL") candidates.add(route.method);
	}

	const allowed: string[] = [];
	for (const method of candidates) {
		if (app.router.match(method, path)[0].length === 0) continue;
		if (method === "GET") allowed.push("HEAD");
		allowed.push(method);
	}
	return allowed;
}

/**
 * 404 for unknown paths; for known paths, 405 (or 200 for OPTIONS) with an Allow header, and
 * 501 when the method is not one the server knows at all.
 */
function notFound(app: Hono, request: Request): Response {
	const allowed = allowedMethods(app, matchPath(request));
	if (allowed.length === 0) {
		return new Response(null, { status: 404 });
	}

	const headers = { Allow: allowed.join(", ") };
	if (!IMPLEMENTED_METHODS.has(request.method)) {
		return new Response(null, { status: 501, headers });
	}
	if (request.method === "OPTIONS") {
		return new Response(null, { status: 200, headers });
	}
	return new Response(null, { status: 405, headers });
}

/**
 * Creates the Hono HTTP server for a set of tenants.
 *
 * @remarks
 * External setup:
 * - Build tenants (e.g., via `setupTenants`) before calling this function.
 * - The process needs permission to bind the HTTP port.
 *
 * @example
 * const startServer = setupHonoServer(tenants);
 * await startServer({ port: 7180 });
 */
function createApp(
	tenants: AntboxTenant[],
	reload: () => Promise<void>,
	configDir?: string,
	dataDir?: string,
	mcpOptions?: McpHttpOptions,
): Hono {
	const app = new Hono({ getPath: matchPath });

	app.get("/openapi.yaml", adapt(openapiSpecHandler(join(process.cwd(), "openapi.yaml"))));

	const v2 = new Hono();
	v2.route("/", nodesRouter(tenants));
	v2.route("/", aspectsRouter(tenants));
	v2.route("/", featuresRouter(tenants));
	v2.route("/", agentsRouter(tenants));
	v2.route("/", apiKeysRouter(tenants));
	v2.route("/", usersRouter(tenants));
	v2.route("/", groupsRouter(tenants));
	v2.route("/", actionsRouter(tenants));
	v2.route("/", extensionsRouter(tenants));
	v2.route("/", templatesRouter(tenants));
	v2.route("/", docsRouter(tenants));
	v2.route("/", loginRouter(tenants));
	v2.route("/", workflowsRouter(tenants));
	v2.route("/", articlesRouter(tenants));
	v2.route("/", auditRouter(tenants));
	v2.route("/", notificationsRouter(tenants));
	v2.route("/", userPreferencesRouter(tenants));
	v2.route("/", heartbeatRouter());
	v2.route("/", adminRouter(tenants, reload, configDir, dataDir));
	v2.route("/", metricsRouter(tenants));

	app.route("/v2", v2);
	app.route("/", mcpRouter(tenants, mcpOptions));
	app.route("/", webdavRouter(tenants));

	app.notFound((ctx) => notFound(app, ctx.req.raw));

	return app;
}

/** The complete request handler of the server: routing plus the Server header on every response. */
export function createFetch(
	tenants: AntboxTenant[],
	reload: () => Promise<void>,
	configDir?: string,
	dataDir?: string,
	mcpOptions?: McpHttpOptions,
): (request: Request) => Promise<Response> {
	const app = createApp(tenants, reload, configDir, dataDir, mcpOptions);
	return async (request: Request) => withServerHeader(await app.fetch(request));
}

export default function setupHonoServer(
	tenants: AntboxTenant[],
	reload: () => Promise<void>,
	configDir?: string,
	dataDir?: string,
	mcpOptions?: McpHttpOptions,
): startHttpServer {
	const fetch = createFetch(tenants, reload, configDir, dataDir, mcpOptions);

	return (options: HttpServerOpts & Omit<ServeOptions, "port"> = { port: 7180 }) => {
		return startServer(fetch, options);
	};
}
