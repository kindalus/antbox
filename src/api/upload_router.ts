import processError from "./process_error.ts";

import EcmRegistry from "../ecm/ecm_registry.ts";
import { getRequestContext } from "./request_context_builder.ts";

import {
  FormFile,
  OpineRequest,
  OpineResponse,
  RequestHandler,
  Router,
} from "../deps.ts";
import upload from "./upload.ts";

const uploadRouter = Router();
export default uploadRouter;

type UploadRequest = OpineRequest & { file: FormFile };

uploadRouter.post(
  "/nodes",
  upload(),
  createNodeFileHandler as unknown as RequestHandler,
);

uploadRouter.post(
  "/nodes/:uuid",
  upload(),
  updateNodeFileHandler as unknown as RequestHandler,
);

function createNodeFileHandler(req: UploadRequest, res: OpineResponse) {
  if (req.file) {
    const file = getFileBlob(req.file);

    return EcmRegistry.instance.nodeService
      .createFile(getRequestContext(req), file, req.body?.parent)
      .then((result) => res.json(result))
      .catch((err) => processError(err, res));
  }

  return Promise.resolve(res.sendStatus(400));
}

function getFileBlob(file: FormFile) {
  if (!file.content) {
    throw new Error("File too large");
  }

  return new File([file.content], file.filename, { type: file.type });
}

function updateNodeFileHandler(req: UploadRequest, res: OpineResponse) {
  if (req.file) {
    return EcmRegistry.instance.nodeService
      .updateFile(
        getRequestContext(req),
        req.params.uuid,
        getFileBlob(req.file),
      )
      .then((result) => res.json(result))
      .catch((err) => processError(err, res));
  }

  return Promise.resolve(res.sendStatus(400));
}
