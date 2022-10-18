import { OpineRequest, OpineResponse, Router } from "/deps/opine";

import { EcmRegistry } from "/application/ecm_registry.ts";
import { processError } from "./process_error.ts";
import { getRequestContext } from "./request_context_builder.ts";

export const extRouter = Router();

extRouter.get("/:uuid", runHandler);
extRouter.post("/:uuid", runHandler);

function runHandler(req: OpineRequest, res: OpineResponse) {
  const request: Request = {} as Request;

  EcmRegistry.instance.extService
    .run(getRequestContext(req), req.params.uuid, request)
    .then((resOrErr) => {
      if (resOrErr.isLeft()) {
        return res.setStatus(500).send(resOrErr.value);
      }

      return writeResponse(resOrErr.value, res);
    })
    .catch((err) => processError(err, res));
}

function writeResponse(response: Response, res: OpineResponse) {
  res.setHeader("Content-Type", response.headers.get("Content-Type")!);

  response
    .blob()
    .then((blob) => blob.arrayBuffer())
    .then((buffer) => new Uint8Array(buffer))
    .then((bytes) => {
      res.send(bytes);
    });
}
