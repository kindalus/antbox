import { json, opine, raw } from "/deps/opine";
import { opineCors } from "/deps/cors";

import { EcmConfig, EcmRegistry } from "/application/ecm_registry.ts";
import { aspectsRouter } from "./aspects_router.ts";

import { nodesRouter } from "./nodes_router.ts";
import { uploadRouter } from "./upload_router.ts";
import { actionsRouter } from "./actions_router.ts";
import { webContentsRouter } from "./web_contents_router.ts";
import { extRouter } from "./ext_router.ts";

export function setupOpineServer(config: EcmConfig) {
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

  const cb: { value?: () => void } = { value: undefined };

  const result = new Promise((resolve) => {
    cb.value = () => {
      resolve(undefined);
    };
  });

  return (options: { port: number }) => {
    app.listen(options, cb.value);
    return result;
  };
}
