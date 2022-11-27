import { Router, Context, FormDataReader } from "/deps/oak";

import { EcmRegistry } from "/application/ecm_registry.ts";

import { processError } from "./process_error.ts";
import { getRequestContext } from "./request_context_builder.ts";
import { sendBadRequest, sendOK } from "./send_response.ts";
import { ContextWithParams } from "./context_with_params.ts";
import { Node } from "../../domain/nodes/node.ts";
import { Either, left, right } from "../../shared/either.ts";

export const uploadRouter = new Router({ prefix: "/upload" });

uploadRouter.post("/nodes", createNodeFileHandler);
uploadRouter.post("/nodes/:uuid", updateNodeFileHandler);

async function readRequest(
  ctx: Context
): Promise<Either<undefined, { file: File; metadata?: Partial<Node> }>> {
  const body = ctx.request.body();
  if (body.type !== "form-data") {
    return left(undefined);
  }

  const { files } = await (body.value! as FormDataReader).read({
    maxFileSize: 100 * 1024 ** 2,
    customContentTypes: {
      "text/javascript": "js",
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

async function createNodeFileHandler(ctx: Context) {
  const fieldsOrUndefined = await readRequest(ctx);
  if (fieldsOrUndefined.isLeft()) {
    return sendBadRequest(ctx);
  }

  if (!fieldsOrUndefined.value.metadata) {
    return sendBadRequest(ctx);
  }

  return EcmRegistry.instance.nodeService
    .createFile(
      getRequestContext(ctx),
      fieldsOrUndefined.value.file,
      fieldsOrUndefined.value.metadata
    )
    .then((result) => {
      if (result.isLeft()) {
        return processError(result.value, ctx);
      }

      sendOK(ctx);
    })
    .catch((err) => processError(err, ctx));
}

async function updateNodeFileHandler(ctx: ContextWithParams) {
  const fieldsOrUndefined = await readRequest(ctx);

  if (fieldsOrUndefined.isLeft()) {
    return sendBadRequest(ctx);
  }

  return EcmRegistry.instance.nodeService
    .updateFile(
      getRequestContext(ctx),
      ctx.params.uuid,
      fieldsOrUndefined.value.file
    )
    .then((result) => {
      if (result.isLeft()) {
        return processError(result.value, ctx);
      }

      sendOK(ctx);
    })
    .catch((err) => processError(err, ctx));
}
