import { Application } from "/deps/oak";
import { oakCors } from "/deps/cors";

import aspectsRouter from "./aspects_router.ts";

import nodesRouter from "./nodes_router.ts";
import uploadRouter from "./upload_router.ts";
import actionsRouter from "./actions_router.ts";
import webContentsRouter from "./web_contents_router.ts";
import extRouter from "./ext_router.ts";
import { AntboxService } from "../../application/antbox_service.ts";

export function setupOakServer(service: AntboxService) {
  const app = new Application();

  app.use(oakCors());

  const nodes = nodesRouter(service);
  const upload = uploadRouter(service);
  const actions = actionsRouter(service);
  const webContent = webContentsRouter(service);
  const ext = extRouter(service);
  const aspects = aspectsRouter(service);

  app.use(nodes.routes());
  app.use(webContent.routes());
  app.use(aspects.routes());
  app.use(actions.routes());
  app.use(upload.routes());
  app.use(ext.routes());

  app.use(nodes.allowedMethods());
  app.use(webContent.allowedMethods());
  app.use(aspects.allowedMethods());
  app.use(actions.allowedMethods());
  app.use(upload.allowedMethods());
  app.use(ext.allowedMethods());

  return (options: { port: number }) => {
    return new Promise<void>((resolve) => {
      app.addEventListener("listen", () => {
        resolve();
      });

      app.listen({ ...options });
    });
  };
}
