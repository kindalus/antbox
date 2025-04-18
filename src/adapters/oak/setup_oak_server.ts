import aspectsRouter from "./aspects_router.ts";
import nodesRouter from "./nodes_router.ts";
// import uploadRouter from "./upload_router.ts";
// import actionsRouter from "./actions_router.ts";
// import webContentsRouter from "./web_contents_router.ts";
// import extRouter from "./ext_router.ts";
// import groupsRouter from "./groups_router.ts";
// import usersRouter from "./users_router.ts";
// import apiKeysRouter from "./api_keys_router.ts";

import loginRouter from "./login_router.ts";
import type { AntboxTenant } from "api/antbox_tenant.ts";
import { Application } from "@oak/oak";
import type { HttpServerOpts, startHttpServer } from "api/http_server.ts";

export function setupOakServer(tenants: AntboxTenant[]): startHttpServer {
  const app = new Application();

  const nodes = nodesRouter(tenants);
  const aspects = aspectsRouter(tenants);
  const login = loginRouter(tenants);

  // const upload = uploadRouter(tenants);
  // const actions = actionsRouter(tenants);
  // const webContent = webContentsRouter(tenants);
  // const ext = extRouter(tenants);
  // const groups = groupsRouter(tenants);
  // const users = usersRouter(tenants);
  // const apikeys = apiKeysRouter(tenants);

  app.use(nodes.routes());
  app.use(aspects.routes());
  app.use(login.routes());

  // app.use(webContent.routes());
  // app.use(actions.routes());
  // app.use(upload.routes());
  // app.use(ext.routes());
  // app.use(groups.routes());
  // app.use(users.routes());
  // app.use(apikeys.routes());

  app.use(nodes.allowedMethods());
  app.use(aspects.allowedMethods());
  app.use(login.allowedMethods());

  // app.use(webContent.allowedMethods());
  // app.use(actions.allowedMethods());
  // app.use(upload.allowedMethods());
  // app.use(ext.allowedMethods());
  // app.use(groups.allowedMethods());
  // app.use(users.allowedMethods());
  // app.use(apikeys.allowedMethods());

  return (options: HttpServerOpts = { port: 7180 }) => {
    return new Promise((resolve) => {
      app.addEventListener("listen", (evt) => {
        resolve(evt);
      });

      app.listen({ ...options });
    });
  };
}
