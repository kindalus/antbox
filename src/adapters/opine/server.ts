import { json, opine, raw } from "/deps/opine";
import { opineCors } from "/deps/opineCors";

import { EcmConfig, EcmRegistry } from "/application/ecm_registry.ts";
import { aspectsRouter } from "./aspects_router.ts";

import { nodesRouter } from "./nodes_router.ts";
import { uploadRouter } from "./upload_router.ts";
import { actionsRouter } from "./actions_router.ts";
import { webContentsRouter } from "./web_contents_router.ts";
import { extRouter } from "./ext_router.ts";

export function startServer(config: EcmConfig) {
  EcmRegistry.buildIfNone(config);
  const app = opine();

  app.use(opineCors());
  app.use(json()); // for parsing application/json
  app.use(raw());

  app.use("/nodes", nodesRouter);
  app.use("/web-contents", webContentsRouter);
  app.use("/aspects", aspectsRouter);
  app.use("/actions", actionsRouter);
  app.use("/upload", uploadRouter);
  app.use("/ext", extRouter);

  return app;
}
