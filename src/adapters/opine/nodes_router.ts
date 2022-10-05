import { OpineRequest, OpineResponse, Router } from "/deps/opine";
import { EcmRegistry } from "/application/ecm_registry.ts";
import { processError } from "./process_error.ts";
import { getRequestContext } from "./request_context_builder.ts";

export const nodesRouter = Router();

nodesRouter.get("/:uuid", getHandler);
nodesRouter.get("/:uuid/export", exportHandler);
nodesRouter.get("/:uuid/copy", copyHandler);
nodesRouter.get("/:uuid/evaluate", evaluateHandler);

nodesRouter.get("/", listHandler);

nodesRouter.post("/", createFolderHandler);
nodesRouter.post("/query", queryHandler);

nodesRouter.patch("/:uuid", updateHandler);

nodesRouter.delete("/:uuid", deleteHandler);

function listHandler(req: OpineRequest, res: OpineResponse) {
  return EcmRegistry.instance.nodeService
    .list(getRequestContext(req), req.query.parent as string)
    .then((result) => res.json(result))
    .catch((err) => processError(err, res));
}

function getHandler(req: OpineRequest, res: OpineResponse) {
  return EcmRegistry.instance.nodeService
    .get(getRequestContext(req), req.params.uuid)
    .then((result) => res.json(result))
    .catch((err) => processError(err, res));
}

function exportHandler(req: OpineRequest, res: OpineResponse) {
  const uuid = req.params.uuid;
  const requestContext = getRequestContext(req);

  return Promise.all([
    EcmRegistry.instance.nodeService.get(requestContext, uuid),
    EcmRegistry.instance.nodeService.export(requestContext, uuid),
  ])
    .then(async ([node, blob]) => {
      res.append("Content-Type", node.mimetype);
      res.append("Content-Length", blob.size.toString());

      const chunks = new Uint8Array(await blob.arrayBuffer());

      res.send(chunks);
    })
    .catch((err) => processError(err, res));
}

function createFolderHandler(req: OpineRequest, res: OpineResponse) {
  const {
    title,
    parent,
    type,
  }: { title: string; parent?: string; type?: "Folder" | "Metanode" } =
    req.body;

  if (!title) {
    return Promise.resolve(res.setStatus(400).json("{ title } not given"));
  }

  const srv = EcmRegistry.instance.nodeService;
  const ctx = getRequestContext(req);

  const creator =
    type === "Metanode"
      ? srv.createMetanode(ctx, title, parent)
      : srv.createFolder(ctx, title, parent);

  return creator
    .then((result) => res.json(result))
    .catch((err) => processError(err, res));
}

function updateHandler(req: OpineRequest, res: OpineResponse) {
  return EcmRegistry.instance.nodeService
    .update(getRequestContext(req), req.params.uuid, req.body)
    .then(() => res.sendStatus(200))
    .catch((err) => processError(err, res));
}

function deleteHandler(req: OpineRequest, res: OpineResponse) {
  return EcmRegistry.instance.nodeService
    .delete(getRequestContext(req), req.params.uuid)
    .then(() => res.sendStatus(200))
    .catch((err) => processError(err, res));
}

function copyHandler(req: OpineRequest, res: OpineResponse) {
  return EcmRegistry.instance.nodeService
    .copy(getRequestContext(req), req.params.uuid)
    .then((result) => res.json(result))
    .catch((err) => processError(err, res));
}

function queryHandler(req: OpineRequest, res: OpineResponse) {
  const { filters, pageSize, pageToken } = req.body;

  return EcmRegistry.instance.nodeService
    .query(getRequestContext(req), filters, pageSize, pageToken)
    .then((result) => res.json(result))
    .catch((err) => processError(err, res));
}

function evaluateHandler(req: OpineRequest, res: OpineResponse) {
  return EcmRegistry.instance.nodeService
    .evaluate(getRequestContext(req), req.params.uuid)
    .then((result) => res.json(result))
    .catch((err) => processError(err, res));
}
