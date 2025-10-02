import { AntboxError } from "shared/antbox_error.ts";

export class ArticleNotFound extends AntboxError {
	static ERROR_CODE = "ArticleNotFound";

	constructor(uuid: string) {
		super(ArticleNotFound.ERROR_CODE, `Article not found for the id: ${uuid}`);
	}
}
