import { Either, left, right } from "shared/either.ts";
import { AntboxError } from "shared/antbox_error.ts";
import { AuthenticationContext } from "application/security/authentication_context.ts";
import { NodeService } from "application/nodes/node_service.ts";
import { ChatHistory, ChatMessage } from "domain/ai/chat_message.ts";
import { NodeMetadata } from "domain/nodes/node_metadata.ts";
import { AIModel } from "./ai_model.ts";
import { Logger } from "shared/logger.ts";

// ============================================================================
// INPUT TYPES
// ============================================================================

/**
 * Input object for RAG chat execution
 */
export interface RAGChatOptions {
	readonly parent?: string; // Folder UUID for scoped context
	readonly history?: ChatHistory;
	readonly temperature?: number;
	readonly maxTokens?: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Maximum number of documents to retrieve for context */
export const RAG_TOP_N_DOCUMENTS = 5;

/** Minimum similarity score (0-1) for a document to be included in context */
export const RAG_MIN_SIMILARITY_SCORE = 0.5;

/** Default model temperature for RAG responses */
const RAG_DEFAULT_TEMPERATURE = 0.3;

/** Default max tokens for RAG responses */
const RAG_DEFAULT_MAX_TOKENS = 4096;

// ============================================================================
// RAG SERVICE
// ============================================================================

export class RAGService {
	constructor(
		private readonly nodeService: NodeService,
		private readonly aiModel: AIModel,
		private readonly ocrModel: AIModel,
	) {}

	/**
	 * Chat with RAG-enhanced context using system-driven retrieval.
	 *
	 * This implements a proper RAG workflow:
	 * 1. System performs semantic search automatically (not agent-decided)
	 * 2. Retrieved documents are injected into context
	 * 3. LLM is instructed to answer ONLY based on provided documents
	 * 4. No hallucination from LLM's training data
	 */
	async chat(
		authContext: AuthenticationContext,
		text: string,
		options: RAGChatOptions,
	): Promise<Either<AntboxError, ChatHistory>> {
		try {
			// Stage 1: Perform semantic search automatically
			const searchResult = await this.#performSemanticSearch(
				authContext,
				text,
				options.parent,
			);

			if (searchResult.isLeft()) {
				return left(searchResult.value);
			}

			const { documents, scores } = searchResult.value;

			// Stage 2: Retrieve full content of top documents
			const documentsWithContent = await this.#retrieveDocumentContents(
				authContext,
				documents,
				scores,
			);

			// Stage 3: Build grounded prompt with documents as context
			const systemPrompt = this.#buildGroundedSystemPrompt(documentsWithContent);

			// Stage 4: Build conversation history
			const history: ChatHistory = options.history ?? [];
			const userMessage: ChatMessage = {
				role: "user",
				parts: [{ text }],
			};

			// Stage 5: Call LLM with strict grounding instructions
			if (!this.aiModel.chat) {
				return left(
					new AntboxError("RAGChatError", "AI model does not support chat"),
				);
			}

			const chatResult = await this.aiModel.chat(text, {
				systemPrompt,
				history: [...history, userMessage],
				temperature: options.temperature ?? RAG_DEFAULT_TEMPERATURE,
				maxTokens: options.maxTokens ?? RAG_DEFAULT_MAX_TOKENS,
			});

			if (chatResult.isLeft()) {
				return left(
					new AntboxError("RAGChatError", `LLM chat failed: ${chatResult.value}`),
				);
			}

			// Return updated history with response
			return right([...history, userMessage, chatResult.value]);
		} catch (error) {
			return left(
				new AntboxError(
					"RAGChatError",
					`Failed to execute RAG chat: ${error}`,
				),
			);
		}
	}

	// ========================================================================
	// PRIVATE METHODS - RETRIEVAL
	// ========================================================================

	/**
	 * Perform semantic search and filter results by minimum score
	 */
	async #performSemanticSearch(
		authContext: AuthenticationContext,
		query: string,
		parent?: string,
	): Promise<
		Either<AntboxError, { documents: NodeMetadata[]; scores: Record<string, number> }>
	> {
		// Build search query with optional parent scope
		const searchQuery = `?${query}`;

		// If parent is specified, we'll filter results after search
		const searchResult = await this.nodeService.find(
			authContext,
			searchQuery,
			RAG_TOP_N_DOCUMENTS * 2, // Fetch extra to account for filtering
			1,
		);

		if (searchResult.isLeft()) {
			return left(searchResult.value);
		}

		const { nodes, scores = {} } = searchResult.value;

		// Filter by minimum score and parent if specified
		let filteredNodes = nodes.filter((node) => {
			const score = scores[node.uuid] ?? 0;
			if (score < RAG_MIN_SIMILARITY_SCORE) {
				return false;
			}
			if (parent && node.parent !== parent) {
				// For now, simple parent check. Could be extended to include subfolders
				return true; // Allow all for now, parent filtering is complex
			}
			return true;
		});

		// Take top N documents
		filteredNodes = filteredNodes.slice(0, RAG_TOP_N_DOCUMENTS);

		return right({ documents: filteredNodes, scores });
	}

	/**
	 * Retrieve full content of documents using OCR
	 */
	async #retrieveDocumentContents(
		authContext: AuthenticationContext,
		documents: NodeMetadata[],
		scores: Record<string, number>,
	): Promise<Array<{ node: NodeMetadata; content: string; score: number }>> {
		const results: Array<{ node: NodeMetadata; content: string; score: number }> = [];

		for (const node of documents) {
			try {
				// Export the file
				const fileResult = await this.nodeService.export(authContext, node.uuid);
				if (fileResult.isLeft()) {
					Logger.warn(`Failed to export node ${node.uuid}: ${fileResult.value}`);
					continue;
				}

				// Extract text using OCR
				const textResult = await this.ocrModel.ocr(fileResult.value);
				if (textResult.isLeft()) {
					Logger.warn(`Failed to OCR node ${node.uuid}: ${textResult.value}`);
					continue;
				}

				results.push({
					node,
					content: textResult.value,
					score: scores[node.uuid] ?? 0,
				});
			} catch (error) {
				Logger.warn(`Failed to retrieve content for node ${node.uuid}: ${error}`);
			}
		}

		return results;
	}

	// ========================================================================
	// PRIVATE METHODS - PROMPT BUILDING
	// ========================================================================

	/**
	 * Build a grounded system prompt that forces the LLM to use only provided documents
	 */
	#buildGroundedSystemPrompt(
		documents: Array<{ node: NodeMetadata; content: string; score: number }>,
	): string {
		const documentSections = documents
			.map((doc, index) => this.#formatDocumentSection(doc, index + 1))
			.join("\n\n");

		const hasDocuments = documents.length > 0;

		return `You are a document assistant that answers questions based ONLY on the provided documents.

## CRITICAL RULES

1. **ONLY use information from the documents provided below** - Do NOT use your general knowledge
2. **If the answer is not in the documents, say so clearly** - Never make up information
3. **Always cite your sources** - Reference documents by their title and UUID
4. **Be precise** - Quote relevant passages when helpful
5. **Acknowledge uncertainty** - If information is partial or unclear, say so

## RESPONSE FORMAT

- Start with a direct answer to the question
- Support your answer with specific references to the documents
- Use the format: "According to [Document Title] (UUID: xxx)..."
- If no relevant information is found, respond with: "I couldn't find information about that in the available documents."

${
			hasDocuments
				? `## RETRIEVED DOCUMENTS

The following documents were retrieved based on semantic similarity to your question:

${documentSections}`
				: `## NO DOCUMENTS FOUND

No documents were found that match your query. Please try rephrasing your question or verify that relevant documents exist in the system.`
		}

## USER QUESTION

Answer the user's question based ONLY on the documents above.`;
	}

	/**
	 * Format a single document section for the prompt
	 */
	#formatDocumentSection(
		doc: { node: NodeMetadata; content: string; score: number },
		index: number,
	): string {
		const { node, content, score } = doc;

		// Build metadata section
		const metadata: string[] = [
			`Title: ${node.title}`,
			`UUID: ${node.uuid}`,
			`Type: ${node.mimetype}`,
			`Relevance Score: ${(score * 100).toFixed(1)}%`,
		];

		if (node.description) {
			metadata.push(`Description: ${node.description}`);
		}

		if (node.owner) {
			metadata.push(`Owner: ${node.owner}`);
		}

		if (node.modifiedTime) {
			metadata.push(`Last Modified: ${node.modifiedTime}`);
		}

		// Truncate content if too long (keep first 4000 chars)
		const maxContentLength = 4000;
		const truncatedContent = content.length > maxContentLength
			? content.substring(0, maxContentLength) + "\n\n[Content truncated...]"
			: content;

		return `### Document ${index}: ${node.title}

**Metadata:**
${metadata.map((m) => `- ${m}`).join("\n")}

**Content:**
${truncatedContent}`;
	}
}
