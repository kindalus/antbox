import { NextFunction, OpineRequest, OpineResponse } from "/deps/opine";

import * as R from "/deps/ramda";
import { FormFile, MultipartReader } from "/deps/mime";

import { fileExistsSync } from "/shared/file_exists_sync.ts";

export type UploadRequest = OpineRequest & {
  file?: FormFile;
  metadata?: FormFile;
};

const { compose, nth, split } = R;

const TMP_DIR = Deno.makeTempDirSync({ prefix: "antbox" });
const MAX_FILE_SIZE = Math.pow(1024, 3); // 1GB

const getBoundary = compose(nth(1), split("="), nth(1), split(";"));

export function upload() {
  return async (
    oreq: OpineRequest,
    _res: OpineResponse,
    next: NextFunction
  ) => {
    const req: UploadRequest = oreq as unknown as UploadRequest;
    let boundary;

    const contentType = req.get("content-type");

    if (contentType?.startsWith("multipart/form-data")) {
      boundary = getBoundary(contentType);
    }

    if (!fileExistsSync(TMP_DIR)) {
      await Deno.mkdir(TMP_DIR, { recursive: true });
    }

    const reader = new MultipartReader(req.body, boundary);

    const form = await reader.readForm({
      maxMemory: MAX_FILE_SIZE,
      dir: TMP_DIR,
    });

    req.file = form.files("file")?.[0];
    req.metadata = form.files("metadata")?.[0];

    next();
  };
}
