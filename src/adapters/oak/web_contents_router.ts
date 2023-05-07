import { Router } from "../../../deps.ts";
import { AntboxService } from "../../application/antbox_service.ts";
import { WebContent } from "../../application/builtin_aspects/web_content.ts";
import { AuthContextProvider } from "../../domain/auth/auth_provider.ts";
import { AntboxError } from "../../shared/antbox_error.ts";
import { Either, left, right } from "../../shared/either.ts";
import { ContextWithParams } from "./context_with_params.ts";
import { getRequestContext } from "./get_request_context.ts";
import { processError } from "./process_error.ts";
import { sendOK } from "./send_response.ts";

export default function (service: AntboxService) {
  const handleGet = (ctx: ContextWithParams) => {
    const requestCtx = getRequestContext(ctx);
    const uuid = ctx.params.uuid as string;

    return Promise.all([
      service.get(requestCtx, uuid),
      getWebContentText(service, requestCtx, uuid),
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
  };

  const handleGetByLanguage = (ctx: ContextWithParams) => {
    const lang = ctx.params.lang as "pt" | "en" | "es" | "fr";
    return getWebContentText(service, getRequestContext(ctx), ctx.params.uuid)
      .then((webContent) => {
        if (webContent.isLeft()) {
          return processError(webContent.value, ctx);
        }

        sendOK(ctx, webContent.value[lang] ?? webContent.value.pt);
      })
      .catch((err) => processError(err, ctx));
  };

  const webContentsRouter = new Router({ prefix: "/web-contents" });

  webContentsRouter.get("/:uuid/:lang", handleGetByLanguage);
  webContentsRouter.get("/:uuid", handleGet);

  return webContentsRouter;
}

function getWebContentText(
  service: AntboxService,
  authCtx: AuthContextProvider,
  uuid: string
): Promise<Either<AntboxError, Partial<WebContent>>> {
  return service.export(authCtx, uuid).then((fileOrError) => {
    if (fileOrError.isLeft()) {
      return left(fileOrError.value);
    }

    return fileOrError.value
      .text()
      .then((text) => JSON.parse(text))
      .then((json) => right(json));
  });
}
