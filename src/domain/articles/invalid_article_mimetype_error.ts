import { AntboxError } from "shared/antbox_error";

export class InvalidArticleMimetypeError extends AntboxError {
    static ERROR_CODE = "InvalidArticleMimetypeError";
  
    constructor(mimetype: string) {
      super(InvalidArticleMimetypeError.ERROR_CODE, `Article mimetype: ${mimetype} is invalid`);
    }
  }