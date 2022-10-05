import { Action } from "/domain/actions/action.ts";
import { OpineResponse, Router } from "/deps/opine";
import { FormFile } from "/deps/mime";

import { EcmRegistry } from "/application/ecm_registry.ts";

import { processError } from "./process_error.ts";
import { getRequestContext } from "./request_context_builder.ts";
import { UploadRequest, upload } from "./upload.ts";

export const uploadRouter = Router();

uploadRouter.post("/nodes", upload(), createNodeFileHandler);
uploadRouter.post("/nodes/:uuid", upload(), updateNodeFileHandler);

uploadRouter.post("/actions", upload(), uploadActionHandler);

function createNodeFileHandler(req: UploadRequest, res: OpineResponse) {
  if (req.file) {
    const file = getFileBlob(req.file);

    return EcmRegistry.instance.nodeService
      .createFile(getRequestContext(req), file, req.parent)
      .then((result) => res.json(result))
      .catch((err) => processError(err, res));
  }
  return Promise.resolve(res.sendStatus(400));
}

function updateNodeFileHandler(req: UploadRequest, res: OpineResponse) {
  if (req.file) {
    return EcmRegistry.instance.nodeService
      .updateFile(
        getRequestContext(req),
        req.params.uuid,
        getFileBlob(req.file)
      )
      .then((result) => res.json(result))
      .catch((err) => processError(err, res));
  }

  return Promise.resolve(res.sendStatus(400));
}

async function uploadActionHandler(req: UploadRequest, res: OpineResponse) {
  if (!req.file) {
    return Promise.resolve(res.sendStatus(400));
  }

  const action = await getFileBlob(req.file);

  return EcmRegistry.instance.actionService
    .createOrrReplace(getRequestContext(req), action)
    .then((result) => res.json(result))
    .catch((err) => processError(err, res));
}

function getFileBlob(file: FormFile) {
  if (!file.content) {
    throw new Error("File too large");
  }

  return new File([file.content], file.filename, { type: file.type });
}
