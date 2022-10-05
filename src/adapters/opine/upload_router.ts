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

uploadRouter.post("/actions", upload(), createActionHandler);
uploadRouter.post("/actions/:uuid", upload(), updateActionHandler);

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

async function createActionHandler(req: UploadRequest, res: OpineResponse) {
  if (!req.file) {
    return Promise.resolve(res.sendStatus(400));
  }

  const action = await actionFromFile(req.file);

  return EcmRegistry.instance.actionService
    .create(getRequestContext(req), action)
    .then((result) => res.json(result))
    .catch((err) => processError(err, res));
}

async function updateActionHandler(req: UploadRequest, res: OpineResponse) {
  if (!req.file) {
    return Promise.resolve(res.sendStatus(400));
  }

  const action = await actionFromFile(req.file);

  return EcmRegistry.instance.actionService
    .update(getRequestContext(req), req.params.uuid, action)
    .then((result) => res.json(result))
    .catch((err) => {
      processError(err, res);
    });
}

function getFileBlob(file: FormFile) {
  if (!file.content) {
    throw new Error("File too large");
  }

  return new File([file.content], file.filename, { type: file.type });
}

async function actionFromFile(formFile: FormFile): Promise<Action> {
  const filepath = Deno.makeTempFileSync();

  const file = getFileBlob(formFile);
  const arrayBuffer = await file.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);

  Deno.writeFileSync(filepath, uint8Array);

  const action = await import(filepath);

  return action.default;
}
