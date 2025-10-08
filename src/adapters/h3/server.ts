import loginRouter from "adapters/h3/login_v2_router.ts";
import nodesRouter from "adapters/h3/nodes_v2_router.ts";
import aspectsRouter from "adapters/h3/aspects_v2_router.ts";
import agentsRouter from "adapters/h3/agents_v2_router.ts";
import featuresRouter from "adapters/h3/features_v2_router.ts";
import apiKeysRouter from "adapters/h3/api_keys_v2_router.ts";
import usersRouter from "adapters/h3/users_v2_router.ts";
import groupsRouter from "adapters/h3/groups_v2_router.ts";
import actionsRouter from "adapters/h3/actions_v2_router.ts";
import extensionsRouter from "adapters/h3/extensions_v2_router.ts";
import templatesRouter from "adapters/h3/templates_v2_router.ts";
import docsRouter from "adapters/h3/docs_v2_router.ts";
import type { AntboxTenant } from "api/antbox_tenant.ts";
import { App, createApp, createRouter, useBase } from "h3";

// TODO: Should return a startServerFn
export default function setupH3Server(tenants: AntboxTenant[]): App {
	const app = createApp();

	const nodes = nodesRouter(tenants);
	const aspects = aspectsRouter(tenants);
	const features = featuresRouter(tenants);
	const agents = agentsRouter(tenants);
	const apiKeys = apiKeysRouter(tenants);
	const users = usersRouter(tenants);
	const groups = groupsRouter(tenants);
	const actions = actionsRouter(tenants);
	const extensions = extensionsRouter(tenants);
	const templates = templatesRouter(tenants);
	const docs = docsRouter(tenants);
	const login = loginRouter(tenants);

	// Create v2 router
	const v2Router = createRouter();

	// Mount individual routers with proper prefixes
	v2Router.use("/nodes/**", useBase("/nodes", nodes.handler));
	v2Router.use("/aspects/**", useBase("/aspects", aspects.handler));
	v2Router.use("/features/**", useBase("/features", features.handler));
	v2Router.use("/agents/**", useBase("/agents", agents.handler));
	v2Router.use("/api-keys/**", useBase("/api-keys", apiKeys.handler));
	v2Router.use("/users/**", useBase("/users", users.handler));
	v2Router.use("/groups/**", useBase("/groups", groups.handler));
	v2Router.use("/actions/**", useBase("/actions", actions.handler));
	v2Router.use("/extensions/**", useBase("/extensions", extensions.handler));
	v2Router.use("/templates/**", useBase("/templates", templates.handler));
	v2Router.use("/docs/**", useBase("/docs", docs.handler));
	v2Router.use("/login/**", useBase("/login", login.handler));

	// Mount v2 router under /v2 prefix
	app.use("/v2/**", useBase("/v2", v2Router.handler));

	return app;
}
