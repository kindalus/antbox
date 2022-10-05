import { OpineRequest, OpineResponse, Router } from "/deps/opine";

import { EcmRegistry } from "/application/ecm_registry.ts";
import { processError } from "./process_error.ts";
import { getRequestContext } from "./request_context_builder.ts";

export const actionsRouter = Router();

actionsRouter.delete("/:uuid", deleteHandler);
actionsRouter.get("/", listHandler);
actionsRouter.get("/:uuid", getHandler);
actionsRouter.get("/:uuid/run", runHandler);

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
    .run(getRequestContext(req), req.params.uuid, req.query, uuids)
    .then(() => res.sendStatus(200))
    .catch((err) => processError(err, res));
}
