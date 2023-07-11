import aspectsRouter from "./aspects_router.ts";

import nodesRouter from "./nodes_router.ts";
import uploadRouter from "./upload_router.ts";
import actionsRouter from "./actions_router.ts";
import webContentsRouter from "./web_contents_router.ts";
import extRouter from "./ext_router.ts";

import loginRouter from "./login_router.ts";
import { Application, oakCors } from "../../../deps.ts";
import { AntboxService } from "../../application/antbox_service.ts";
import { createAuthMiddleware } from "./create_auth_middleware.ts";

export interface ServerOpts {
  port?: number;
}

export interface AntboxTenant {
  name: string;
  service: AntboxService;
  rootPasswd: string;
  rawJwk: Record<string, string>;
  symmetricKey: string;
}

export async function setupOakServer(tenants: AntboxTenant[]) {
  const app = new Application();

  app.use(oakCors());

  const authMiddleware = await createAuthMiddleware(tenants);
  app.use(authMiddleware);

  const nodes = nodesRouter(tenants);
  const upload = uploadRouter(tenants);
  const actions = actionsRouter(tenants);
  const webContent = webContentsRouter(tenants);
  const ext = extRouter(tenants);
  const aspects = aspectsRouter(tenants);
  const login = loginRouter(tenants);

  app.use(nodes.routes());
  app.use(webContent.routes());
  app.use(aspects.routes());
  app.use(actions.routes());
  app.use(upload.routes());
  app.use(ext.routes());
  app.use(login.routes());

  app.use(nodes.allowedMethods());
  app.use(webContent.allowedMethods());
  app.use(aspects.allowedMethods());
  app.use(actions.allowedMethods());
  app.use(upload.allowedMethods());
  app.use(ext.allowedMethods());

  return (options: ServerOpts = { port: 7180 }) => {
    return new Promise((resolve) => {
      app.addEventListener("listen", (evt) => {
        resolve(evt);
      });

      app.listen({ ...options });
    });
  };
}
