import aspectsRouter from "adapters/oak/aspects_v2_router.ts";
import nodesRouter from "adapters/oak/nodes_v2_router.ts";
import featuresRouter from "adapters/oak/features_router.ts";
import agentsRouter from "adapters/oak/agents_v2_router.ts";
import apiKeysRouter from "adapters/oak/api_keys_router.ts";
import usersRouter from "adapters/oak/users_router.ts";
import groupsRouter from "adapters/oak/groups_router.ts";
import actionsRouter from "adapters/oak/actions_router.ts";
import extensionsRouter from "adapters/oak/extensions_router.ts";
import aiToolsRouter from "adapters/oak/ai_tools_router.ts";
import templatesRouter from "adapters/oak/templates_router.ts";
import docsRouter from "adapters/oak/docs_router.ts";

import loginRouter from "adapters/oak/login_v2_router.ts";
import type { AntboxTenant } from "api/antbox_tenant.ts";
import { Application, Router } from "@oak/oak";
import type { HttpServerOpts, startHttpServer } from "api/http_server.ts";

export default function setupOakServer(
	tenants: AntboxTenant[],
): startHttpServer {
	const app = new Application();

	const nodes = nodesRouter(tenants);
	const aspects = aspectsRouter(tenants);
	const features = featuresRouter(tenants);
	const agents = agentsRouter(tenants);
	const apiKeys = apiKeysRouter(tenants);
	const users = usersRouter(tenants);
	const groups = groupsRouter(tenants);
	const actions = actionsRouter(tenants);
	const extensions = extensionsRouter(tenants);
	const aiTools = aiToolsRouter(tenants);
	const templates = templatesRouter(tenants);
	const docs = docsRouter(tenants);
	const login = loginRouter(tenants);

	const v2 = new Router({ prefix: "/v2" });

	v2.use(nodes.routes());
	v2.use(aspects.routes());
	v2.use(features.routes());
	v2.use(agents.routes());
	v2.use(apiKeys.routes());
	v2.use(users.routes());
	v2.use(groups.routes());
	v2.use(actions.routes());
	v2.use(extensions.routes());
	v2.use(aiTools.routes());
	v2.use(templates.routes());
	v2.use(docs.routes());
	v2.use(login.routes());

	v2.use(nodes.allowedMethods());
	v2.use(aspects.allowedMethods());
	v2.use(features.allowedMethods());
	v2.use(agents.allowedMethods());
	v2.use(apiKeys.allowedMethods());
	v2.use(users.allowedMethods());
	v2.use(groups.allowedMethods());
	v2.use(actions.allowedMethods());
	v2.use(extensions.allowedMethods());
	v2.use(aiTools.allowedMethods());
	v2.use(templates.allowedMethods());
	v2.use(docs.allowedMethods());
	v2.use(login.allowedMethods());

	app.use(v2.routes());
	app.use(v2.allowedMethods());

	return (options: HttpServerOpts = { port: 7180 }) => {
		return new Promise((resolve) => {
			app.addEventListener("listen", (evt) => {
				resolve(evt);
			});

			app.listen({ ...options });
		});
	};
}
