import webdavRouter from "adapters/oak/webdav_router.ts";
import loginRouter from "adapters/oak/login_v2_router.ts";
import nodesRouter from "adapters/oak/nodes_v2_router.ts";
import aspectsRouter from "adapters/oak/aspects_v2_router.ts";
import featuresRouter from "adapters/oak/features_v2_router.ts";
import agentsRouter from "adapters/oak/agents_v2_router.ts";
import apiKeysRouter from "adapters/oak/api_keys_v2_router.ts";
import usersRouter from "adapters/oak/users_v2_router.ts";
import groupsRouter from "adapters/oak/groups_v2_router.ts";
import actionsRouter from "adapters/oak/actions_v2_router.ts";
import extensionsRouter from "adapters/oak/extensions_v2_router.ts";
import templatesRouter from "adapters/oak/templates_v2_router.ts";
import docsRouter from "adapters/oak/docs_v2_router.ts";
import aiModelRouter from "adapters/oak/ai_models_v2_router.ts";
import workflowsRouter from "adapters/oak/workflows_v2_router.ts";
import cmisRouter from "adapters/oak/cmis_router.ts";

import type { AntboxTenant } from "api/antbox_tenant.ts";
import { Application, Router } from "@oak/oak";
import type { HttpServerOpts, startHttpServer } from "api/http_server.ts";

export default function setupOakServer(
	tenants: AntboxTenant[],
): startHttpServer {
	const app = new Application();

	const webdav = webdavRouter(tenants);

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
	const aiModels = aiModelRouter(tenants);
	const workflows = workflowsRouter(tenants);
	const cmis = cmisRouter(tenants);

	const v2 = new Router({ prefix: "/v2" });

	v2.use(nodes.routes(), nodes.allowedMethods());
	v2.use(aspects.routes(), aspects.allowedMethods());
	v2.use(features.routes(), features.allowedMethods());
	v2.use(agents.routes(), agents.allowedMethods());
	v2.use(apiKeys.routes(), apiKeys.allowedMethods());
	v2.use(users.routes(), users.allowedMethods());
	v2.use(groups.routes(), groups.allowedMethods());
	v2.use(actions.routes(), actions.allowedMethods());
	v2.use(extensions.routes(), extensions.allowedMethods());
	v2.use(templates.routes(), templates.allowedMethods());
	v2.use(docs.routes(), docs.allowedMethods());
	v2.use(login.routes(), login.allowedMethods());
	v2.use(aiModels.routes(), aiModels.allowedMethods());
	v2.use(workflows.routes(), workflows.allowedMethods());

	app.use(v2.routes(), v2.allowedMethods());
	app.use(cmis.routes(), cmis.allowedMethods());
	app.use(webdav.routes(), webdav.allowedMethods());

	return (options: HttpServerOpts = { port: 7180 }) => {
		return new Promise((resolve) => {
			app.addEventListener("listen", (evt) => {
				resolve(evt);
			});

			app.listen({ ...options });
		});
	};
}
