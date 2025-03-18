import { AntboxError } from "shared/antbox_error";

export class ArticleExistsError extends AntboxError {
    static ERR_CODE = "ArticleExistsError";

    constructor(uuid: string) {
        super(
            ArticleExistsError.ERR_CODE,
            `Article already exists for the uuid: ${uuid}`,
        );
    }
}