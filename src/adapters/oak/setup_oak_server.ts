import { Application } from "/deps/oak";
import { oakCors } from "/deps/cors";

import { EcmConfig, EcmRegistry } from "/application/ecm_registry.ts";
import { aspectsRouter } from "./aspects_router.ts";

import { nodesRouter } from "./nodes_router.ts";
import { uploadRouter } from "./upload_router.ts";
import { actionsRouter } from "./actions_router.ts";
import { webContentsRouter } from "./web_contents_router.ts";
import { extRouter } from "./ext_router.ts";

export function setupOakServer(config: EcmConfig) {
  EcmRegistry.buildIfNone(config);
  const app = new Application();

  app.use(oakCors());

  app.use(nodesRouter.routes());
  app.use(webContentsRouter.routes());
  app.use(aspectsRouter.routes());
  app.use(actionsRouter.routes());
  app.use(uploadRouter.routes());
  app.use(extRouter.routes());

  app.use(nodesRouter.allowedMethods());
  app.use(webContentsRouter.allowedMethods());
  app.use(aspectsRouter.allowedMethods());
  app.use(actionsRouter.allowedMethods());
  app.use(uploadRouter.allowedMethods());
  app.use(extRouter.allowedMethods());

  return (options: { port: number }) => {
    return new Promise<void>((resolve) => {
      app.addEventListener("listen", () => {
        resolve();
      });

      app.listen({ ...options });
    });
  };
}
