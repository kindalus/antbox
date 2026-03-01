import { right } from "shared/either.ts";
import type { Either } from "shared/either.ts";
import type { AntboxError } from "shared/antbox_error.ts";
import type { OCRProvider } from "domain/ai/ocr_provider.ts";

/**
 * NullOCRProvider - Always returns empty string
 * Use for testing or when OCR is not needed.
 */
export class NullOCRProvider implements OCRProvider {
	ocr(_file: File): Promise<Either<AntboxError, string>> {
		return Promise.resolve(right(""));
	}
}
