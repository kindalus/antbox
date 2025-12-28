/**
 * Represents a vector embedding - an array of numbers representing
 * the semantic meaning of text in high-dimensional space
 */
export type Embedding = number[];

/**
 * List of MIME types supported for embedding generation
 * Files with these types will have their text content extracted and embedded
 */
export const EMBEDDINGS_SUPPORTED_MIMETYPES = [
	"text/plain",
	"application/pdf",
	"text/html",
	"text/markdown",
	"application/msword", // .doc
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
	"application/rtf", // .rtf
] as const;

export type EmbeddingsSupportedMimetype = typeof EMBEDDINGS_SUPPORTED_MIMETYPES[number];

/**
 * Check if a mimetype is supported for embedding generation
 * @param mimetype The mimetype to check
 * @returns true if the mimetype is supported
 */
export function isEmbeddingsSupportedMimetype(mimetype: string): boolean {
	return EMBEDDINGS_SUPPORTED_MIMETYPES.includes(mimetype as EmbeddingsSupportedMimetype);
}
