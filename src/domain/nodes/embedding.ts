/**
 * Represents a vector embedding - an array of numbers representing
 * the semantic meaning of text in high-dimensional space
 */
export type Embedding = number[];

/**
 * Length of every stored embedding. Providers must emit this size: repositories with a fixed
 * vector column, such as Postgres, reject any other.
 */
export const EMBEDDING_DIMENSIONS = 768;

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
	"text/csv",
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
] as const;

export type EmbeddingsSupportedMimetype = typeof EMBEDDINGS_SUPPORTED_MIMETYPES[number];

/**
 * Check if a mimetype is supported for embedding generation
 * @param mimetype The mimetype to check
 * @returns true if the mimetype is supported
 */
export function isEmbeddingsSupportedMimetype(mimetype: string): boolean {
	const base = mimetype.split(";")[0].trim().toLowerCase();
	return EMBEDDINGS_SUPPORTED_MIMETYPES.includes(base as EmbeddingsSupportedMimetype);
}
