import { Either, right } from "/shared/either.ts";
import { UnknownError } from "/shared/antbox_error.ts";
import { UserPrincipal } from "/domain/auth/user_principal.ts";
import { WebContent } from "/application/builtin_aspects/web_content.ts";
import { EcmRegistry } from "/application/ecm_registry.ts";
import { processError } from "./process_error.ts";
import { getRequestContext } from "./request_context_builder.ts";

import { OpineRequest, OpineResponse, Router } from "/deps/opine";

export const webContentsRouter = Router();

webContentsRouter.get("/:uuid/:lang", handleGetByLanguage);
webContentsRouter.get("/:uuid", handleGet);

function handleGet(req: OpineRequest, res: OpineResponse) {
  const requestCtx = getRequestContext(req);
  const uuid = req.params.uuid as string;

  Promise.all([
    EcmRegistry.instance.nodeService.get(requestCtx, uuid),
    getWebContentText(requestCtx, uuid),
  ])
    .then(([node, webContent]) => {
      if (node.isLeft()) {
        return processError(node.value, res);
      }

      if (webContent.isLeft()) {
        return processError(webContent.value, res);
      }

      res.send({
        ...webContent.value,
        uuid: node.value.uuid,
        fid: node.value.fid,
        title: node.value.title,
      });
    })
    .catch((err) => processError(err, res));
}

function handleGetByLanguage(req: OpineRequest, res: OpineResponse) {
  const lang = req.params.lang as "pt" | "en" | "es" | "fr";
  getWebContentText(getRequestContext(req), req.params.uuid)
    .then((webContent) => {
      if (webContent.isLeft()) {
        return processError(webContent.value, res);
      }

      res.send(webContent.value[lang] ?? webContent.value.pt);
    })
    .catch((err) => processError(err, res));
}

function getWebContentText(
  principal: UserPrincipal,
  uuid: string
): Promise<Either<UnknownError, Partial<WebContent>>> {
  return EcmRegistry.instance.nodeService
    .export(principal, uuid)
    .then((fileOrError) => {
      if (fileOrError.isLeft()) {
        return fileOrError;
      }

      return fileOrError.value
        .text()
        .then((text) => JSON.parse(text))
        .then((json) => right(json));
    });
}
