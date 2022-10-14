import { OpineResponse, Router } from "/deps/opine";
import { FormFile } from "/deps/mime";

import { EcmRegistry } from "/application/ecm_registry.ts";

import { processError } from "./process_error.ts";
import { getRequestContext } from "./request_context_builder.ts";
import { UploadRequest, upload } from "./upload.ts";
import { Node } from "../../domain/nodes/node.ts";

export const uploadRouter = Router();

uploadRouter.post("/nodes", upload(), createNodeFileHandler);
uploadRouter.post("/nodes/:uuid", upload(), updateNodeFileHandler);

uploadRouter.post("/actions", upload(), uploadActionHandler);

function createNodeFileHandler(req: UploadRequest, res: OpineResponse) {
  if (req.file && req.metadata) {
    const file = getFileBlob(req.file);
    const metadata = getFileJson(req.metadata);

    return EcmRegistry.instance.nodeService
      .createFile(getRequestContext(req), file, metadata)
      .then((result) => {
        if (result.isLeft()) {
          return processError(result.value, res);
        }

        res.json(result.value);
      })
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
      .then((result) => {
        if (result.isLeft()) {
          return processError(result.value, res);
        }

        res.json(result.value);
      })
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
    .createOrReplace(getRequestContext(req), action)
    .then((result) => res.json(result))
    .catch((err) => processError(err, res));
}

function getFileBlob(file: FormFile): File {
  if (!file.content) {
    throw new Error("File content not found");
  }

  return new File([file.content], file.filename, { type: file.type });
}

function getFileJson(file: FormFile): Partial<Node> {
  if (!file.content) {
    throw new Error("Metadata content not found");
  }

  if (file.type !== "application/json") {
    throw new Error("Metadata content is not a JSON");
  }

  const text = new TextDecoder().decode(file.content);

  return JSON.parse(text);
}
