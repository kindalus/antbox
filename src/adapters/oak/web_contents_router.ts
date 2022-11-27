import { Either, right } from "/shared/either.ts";
import { UnknownError } from "/shared/ecm_error.ts";
import { UserPrincipal } from "/domain/auth/user_principal.ts";
import { WebContent } from "/application/builtin_aspects/web_content.ts";
import { EcmRegistry } from "/application/ecm_registry.ts";
import { processError } from "./process_error.ts";
import { getRequestContext } from "./request_context_builder.ts";

import { Router } from "/deps/oak";
import { ContextWithParams } from "./context_with_params.ts";
import { sendOK } from "./send_response.ts";
export const webContentsRouter = new Router({ prefix: "/web-contents" });

webContentsRouter.get("/:uuid/:lang", handleGetByLanguage);
webContentsRouter.get("/:uuid", handleGet);

function handleGet(ctx: ContextWithParams) {
  const requestCtx = getRequestContext(ctx);
  const uuid = ctx.params.uuid as string;

  Promise.all([
    EcmRegistry.instance.nodeService.get(requestCtx, uuid),
    getWebContentText(requestCtx, uuid),
  ])
    .then(([node, webContent]) => {
      if (node.isLeft()) {
        return processError(node.value, ctx);
      }

      if (webContent.isLeft()) {
        return processError(webContent.value, ctx);
      }

      sendOK(ctx, {
        ...webContent.value,
        uuid: node.value.uuid,
        fid: node.value.fid,
        title: node.value.title,
      });
    })
    .catch((err) => processError(err, ctx));
}

function handleGetByLanguage(ctx: ContextWithParams) {
  const lang = ctx.params.lang as "pt" | "en" | "es" | "fr";
  return getWebContentText(getRequestContext(ctx), ctx.params.uuid)
    .then((webContent) => {
      if (webContent.isLeft()) {
        return processError(webContent.value, ctx);
      }

      sendOK(ctx, webContent.value[lang] ?? webContent.value.pt);
    })
    .catch((err) => processError(err, ctx));
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
