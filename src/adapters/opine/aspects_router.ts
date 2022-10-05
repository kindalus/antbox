import { OpineRequest, OpineResponse, Router } from "/deps/opine";
import { Aspect } from "/domain/aspects/aspect.ts";
import { EcmRegistry } from "/application/ecm_registry.ts";
import { processError } from "./process_error.ts";
import { getRequestContext } from "./request_context_builder.ts";

export const aspectsRouter = Router();

aspectsRouter.post("/", createHandler);
aspectsRouter.delete("/:uuid", deleteHandler);
aspectsRouter.get("/", listHandler);
aspectsRouter.get("/:uuid", getHandler);
aspectsRouter.put("/:uuid", updateHandler);

function createHandler(req: OpineRequest, res: OpineResponse) {
  const aspect = req.body as unknown as Aspect;

  EcmRegistry.instance.aspectService
    .create(getRequestContext(req), aspect)
    .then(() => res.sendStatus(200))
    .catch((err) => processError(err, res));
}

function deleteHandler(req: OpineRequest, res: OpineResponse) {
  EcmRegistry.instance.aspectService
    .delete(getRequestContext(req), req.params.uuid)
    .then(() => res.sendStatus(200))
    .catch((err) => processError(err, res));
}

function getHandler(req: OpineRequest, res: OpineResponse) {
  EcmRegistry.instance.aspectService
    .get(getRequestContext(req), req.params.uuid)
    .then((aspect) => res.json(aspect))
    .catch((err) => processError(err, res));
}

function listHandler(req: OpineRequest, res: OpineResponse) {
  EcmRegistry.instance.aspectService
    .list(getRequestContext(req))
    .then((list) => res.json(list))
    .catch((err) => processError(err, res));
}

function updateHandler(req: OpineRequest, res: OpineResponse) {
  const aspect = req.body as unknown as Aspect;
  EcmRegistry.instance.aspectService
    .update(getRequestContext(req), req.params.uuid, aspect)
    .then(() => res.sendStatus(200))
    .catch((err) => processError(err, res));
}
