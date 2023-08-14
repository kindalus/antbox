import { AntboxError } from "../../shared/antbox_error.ts";

const OCR_TEMPLATE_NOT_FOUND_ERROR = "OcrTemplateNotFoundError";

export class OcrNotFoundError extends AntboxError {
	constructor(uuid: string) {
		super(OCR_TEMPLATE_NOT_FOUND_ERROR, `Ocr Template not found: '${uuid}'`);
	}
}
