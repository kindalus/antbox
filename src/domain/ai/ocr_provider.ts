import type { Either } from "shared/either.ts";
import type { AntboxError } from "shared/antbox_error.ts";

/**
 * OCRProvider - Extracts text content from files
 *
 * Implementations can use various OCR services (Google Vision, Tesseract, etc.)
 * or model-based extraction (Gemini, GPT-4V, etc.)
 */
export interface OCRProvider {
	/**
	 * Extract text from a file using OCR or model-based extraction
	 * @param file The file to extract text from
	 * @returns Either an error or the extracted text content
	 */
	ocr(file: File): Promise<Either<AntboxError, string>>;
}
