import type { Either } from "shared/either.ts";
import type { AntboxError } from "shared/antbox_error.ts";
import type { TokenUsage } from "domain/ai/chat_message.ts";

export interface OCRResult {
	text: string;
	/** Present only when extraction consumed model tokens. */
	usage?: TokenUsage;
	/** Model that extracted the text, when one was used. */
	model?: string;
}

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
	 * @returns Either an error or the extracted text content and its token usage
	 */
	ocr(file: File): Promise<Either<AntboxError, OCRResult>>;
}
