/**
 * RagDocument - A document retrieved from the RAG index
 */
export interface RagDocument {
	/** UUID of the source node */
	uuid: string;
	/** Title of the source node */
	title: string;
	/** Text content (OCR output + metadata) */
	content: string;
	/** Similarity score [0, 1] */
	score: number;
}
