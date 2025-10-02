import aspectsRouter from "adapters/oak/aspects_v2_router.ts";
import nodesRouter from "adapters/oak/nodes_v2_router.ts";
import featuresRouter from "adapters/oak/features_v2_router.ts";

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
	const login = loginRouter(tenants);

	const v2 = new Router({ prefix: "/v2" });

	v2.use(nodes.routes());
	v2.use(aspects.routes());
	v2.use(features.routes());
	v2.use(login.routes());

	v2.use(nodes.allowedMethods());
	v2.use(aspects.allowedMethods());
	v2.use(features.allowedMethods());
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
