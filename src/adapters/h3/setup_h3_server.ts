import aspectsRouter from "adapters/h3/aspects_v2_router.ts";
import nodesRouter from "adapters/h3/nodes_v2_router.ts";
import featuresRouter from "adapters/h3/features_v2_router.ts";
import loginRouter from "adapters/h3/login_v2_router.ts";
import type { AntboxTenant } from "api/antbox_tenant.ts";
import { type App, createApp, createRouter } from "h3";
import type { HttpServerOpts, startHttpServer } from "api/http_server.ts";

export function setupH3Server(tenants: AntboxTenant[]): startHttpServer {
  const app: App = createApp();

  const nodes = nodesRouter(tenants);
  const aspects = aspectsRouter(tenants);
  const features = featuresRouter(tenants);
  const login = loginRouter(tenants);

  const v2 = createRouter();

  // Mount routers under v2 prefix
  v2.use("/nodes/**", nodes);
  v2.use("/aspects/**", aspects);
  v2.use("/features/**", features);
  v2.use("/login/**", login);

  app.use("/v2/**", v2);

  return (options: HttpServerOpts = { port: 7180 }) => {
    return new Promise((resolve) => {
      const server = app.listen(options.port, () => {
        console.log(`H3 server running on port ${options.port}`);
        resolve(server);
      });
    });
  };
}
