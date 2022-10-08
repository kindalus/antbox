import { OpineRequest, OpineResponse, Router } from "/deps/opine";

import { EcmRegistry } from "/application/ecm_registry.ts";
import { processError } from "./process_error.ts";
import { getRequestContext } from "./request_context_builder.ts";

export const actionsRouter = Router();

actionsRouter.delete("/:uuid", deleteHandler);
actionsRouter.get("/", listHandler);
actionsRouter.get("/:uuid", getHandler);
actionsRouter.get("/:uuid/-/run", runHandler);
actionsRouter.get("/:uuid/-/export", exportHandler);

function deleteHandler(req: OpineRequest, res: OpineResponse) {
  EcmRegistry.instance.actionService
    .delete(getRequestContext(req), req.params.uuid)
    .then(() => res.sendStatus(200))
    .catch((err) => processError(err, res));
}

function getHandler(req: OpineRequest, res: OpineResponse) {
  EcmRegistry.instance.actionService
    .get(getRequestContext(req), req.params.uuid)
    .then((action) => res.json(action))
    .catch((err) => processError(err, res));
}

function listHandler(req: OpineRequest, res: OpineResponse) {
  EcmRegistry.instance.actionService
    .list(getRequestContext(req))
    .then((list) => res.json(list))
    .catch((err) => processError(err, res));
}

function runHandler(req: OpineRequest, res: OpineResponse) {
  if (!req.query.uuids) {
    return res.sendStatus(400).send("Missing uuids query parameter");
  }

  const uuids = req.query.uuids.split(",");

  EcmRegistry.instance.actionService
    .run(getRequestContext(req), req.params.uuid, uuids, req.query)
    .then(() => res.sendStatus(200))
    .catch((err) => processError(err, res));
}

async function exportHandler(req: OpineRequest, res: OpineResponse) {
  const uuid = req.params.uuid;
  const requestContext = getRequestContext(req);

  const f = await EcmRegistry.instance.actionService.export(
    requestContext,
    uuid
  );

  try {
    res.append("Content-Type", f.type);
    res.append("Content-Length", f.size.toString());
    res.append("Content-Disposition", `attachment; filename=${f.name}`);

    const buffer = await f.arrayBuffer();
    const chunks = new Uint8Array(buffer);

    res.send(chunks);
  } catch (err) {
    processError(err, res);
  }
}
