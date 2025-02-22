import { Context, FormDataReader, Router } from "deps.ts";
import { Node } from "domain/nodes/node.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { type Either, left, right } from "shared/either.ts";
import { ContextWithParams } from "./context_with_params.ts";
import { getRequestContext } from "./get_request_context.ts";
import { getTenant } from "./get_tenant.ts";
import { processEither } from "./process_either.ts";
import { processError } from "./process_error.ts";
import { sendBadRequest, sendOK } from "./send_response.ts";
import { AntboxTenant } from "./setup_oak_server.ts";

export default function (tenants: AntboxTenant[]) {
  const createNodeFileHandler = async (ctx: Context) => {
    const service = getTenant(ctx, tenants).service;

    const fieldsOrUndefined = await readRequest(ctx);
    if (fieldsOrUndefined.isLeft()) {
      return sendBadRequest(ctx);
    }

    if (!fieldsOrUndefined.value.metadata) {
      return sendBadRequest(ctx);
    }

    return service
      .createFile(
        getRequestContext(ctx),
        fieldsOrUndefined.value.file,
        fieldsOrUndefined.value.metadata,
      )
      .then((result) => {
        if (result.isLeft()) {
          return processError(result.value, ctx);
        }

        sendOK(ctx, result.value);
      })
      .catch((err) => processError(err, ctx));
  };

  const updateNodeFileHandler = async (ctx: ContextWithParams) => {
    const service = getTenant(ctx, tenants).service;
    const fieldsOrUndefined = await readRequest(ctx);

    if (fieldsOrUndefined.isLeft()) {
      return sendBadRequest(ctx);
    }

    return service
      .updateFile(
        getRequestContext(ctx),
        ctx.params.uuid,
        fieldsOrUndefined.value.file,
      )
      .then((result) => {
        if (result.isLeft()) {
          return processError(result.value, ctx);
        }

        sendOK(ctx);
      })
      .catch((err) => processError(err, ctx));
  };

  const createOrReplaceAction = async (ctx: Context) => {
    const service = getTenant(ctx, tenants).service;
    const authCtx = getRequestContext(ctx);

    const fieldsOrUndefined = await readRequest(ctx);
    if (fieldsOrUndefined.isLeft()) {
      return sendBadRequest(ctx);
    }

    return service
      .createOrReplaceAction(authCtx, fieldsOrUndefined.value.file)
      .then((result) => processEither(ctx, result))
      .catch((err) => processError(err, ctx));
  };

  const createOrReplaceExtension = async (ctx: Context) => {
    const service = getTenant(ctx, tenants).service;
    const authCtx = getRequestContext(ctx);

    const fieldsOrUndefined = await readRequest(ctx);
    if (fieldsOrUndefined.isLeft()) {
      return sendBadRequest(ctx);
    }

    return service
      .createOrReplaceExtension(
        authCtx,
        fieldsOrUndefined.value.file,
        fieldsOrUndefined.value.metadata!,
      )
      .then((result) => processEither(ctx, result))
      .catch((err) => processError(err, ctx));
  };

  const uploadRouter = new Router({ prefix: "/upload" });

  uploadRouter.post("/nodes", createNodeFileHandler);
  uploadRouter.post("/nodes/:uuid", updateNodeFileHandler);

  uploadRouter.post("/actions", createOrReplaceAction);
  uploadRouter.post("/ext", createOrReplaceExtension);

  return uploadRouter;
}

async function readRequest(
  ctx: Context,
): Promise<Either<undefined, { file: File; metadata?: Partial<Node> }>> {
  const body = ctx.request.body();
  if (body.type !== "form-data") {
    return left(undefined);
  }

  const { files } = await (body.value! as FormDataReader).read({
    maxFileSize: 100 * 1024 ** 2,
    customContentTypes: {
      "text/javascript": "js",
      [Nodes.EXT_MIMETYPE]: "js",
      [Nodes.ASPECT_MIMETYPE]: "json",
      [Nodes.ACTION_MIMETYPE]: "js",
      [Nodes.SMART_FOLDER_MIMETYPE]: "json",
    },
  });

  const metadataUploaded = files?.find((f) => f.name === "metadata");
  const fileUploaded = files?.find((f) => f.name === "file");

  if (!fileUploaded) {
    return left(undefined);
  }

  const fileContent = Deno.readFileSync(fileUploaded.filename!);

  let metadata: Partial<Node> | undefined = undefined;
  if (metadataUploaded) {
    const metadataContent = Deno.readFileSync(metadataUploaded.filename!);
    metadata = JSON.parse(new TextDecoder().decode(metadataContent));
  }

  const file = new File([fileContent], fileUploaded.originalName, {
    type: fileUploaded.contentType,
  });

  return right({ file, metadata });
}
