import aspectsRouter from "adapters/h3/aspects_v2_router.ts";
import nodesRouter from "adapters/h3/nodes_v2_router.ts";
import featuresRouter from "adapters/h3/features_v2_router.ts";
import loginRouter from "adapters/h3/login_v2_router.ts";
import type { AntboxTenant } from "api/antbox_tenant.ts";
import { App, createApp, createRouter, useBase } from "h3";

export function setupH3Server(tenants: AntboxTenant[]): App {
  const app = createApp();

  const nodes = nodesRouter(tenants);
  const aspects = aspectsRouter(tenants);
  const features = featuresRouter(tenants);
  const login = loginRouter(tenants);

  // Create v2 router
  const v2Router = createRouter();

  // Mount individual routers with proper prefixes
  v2Router.use("/nodes/**", useBase("/nodes", nodes.handler));
  v2Router.use("/aspects/**", useBase("/aspects", aspects.handler));
  v2Router.use("/features/**", useBase("/features", features.handler));
  v2Router.use("/login/**", useBase("/login", login.handler));

  // Mount v2 router under /v2 prefix
  app.use("/v2/**", useBase("/v2", v2Router.handler));

  return app;
}
