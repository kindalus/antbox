import { fileMimetype } from "shared/mimetype.ts";
import { left, right } from "shared/either.ts";
import type { Either } from "shared/either.ts";
import { AntboxError } from "shared/antbox_error.ts";
import type { OCRProvider, OCRResult } from "domain/ai/ocr_provider.ts";

const TEXT_MIMETYPES = ["text/plain", "text/markdown", "text/html", "application/json"];

/**
 * TextOCRProvider - Returns raw text content for text-based files
 * Suitable for .txt, .md files in tests and development.
 */
export class TextOCRProvider implements OCRProvider {
	async ocr(file: File): Promise<Either<AntboxError, OCRResult>> {
		if (!TEXT_MIMETYPES.includes(fileMimetype(file))) {
			return left(
				new AntboxError(
					"UnsupportedMimetype",
					`TextOCRProvider does not support mimetype: ${fileMimetype(file)}`,
				),
			);
		}

		try {
			const bytes = new Uint8Array(await file.arrayBuffer());
			const text = new TextDecoder().decode(bytes);
			return right({ text });
		} catch (error) {
			return left(
				new AntboxError(
					"TextExtractionError",
					`Failed to read text from file: ${error}`,
				),
			);
		}
	}
}
