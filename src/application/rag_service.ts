import { Either, left, right } from "shared/either.ts";
import { AntboxError } from "shared/antbox_error.ts";
import { AuthenticationContext } from "application/authentication_context.ts";
import { NodeService } from "application/node_service.ts";
import { AgentsService } from "application/agents_service.ts";
import { ChatHistory } from "domain/ai/chat_message.ts";
import { NodeMetadata } from "domain/nodes/node_metadata.ts";

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

const RAG_AGENT_UUID = "--rag-agent--";

// ============================================================================
// RAG SERVICE
// ============================================================================

export class RAGService {
	constructor(
		private readonly nodeService: NodeService,
		private readonly agentsService: AgentsService,
	) {}

	/**
	 * Chat with RAG-enhanced context using hybrid retrieval
	 */
	async chat(
		authContext: AuthenticationContext,
		text: string,
		options: RAGChatOptions,
	): Promise<Either<AntboxError, ChatHistory>> {
		try {
			// Build enhanced system instructions for RAG context
			let instructions = this.buildRAGInstructions(options.parent);

			// Build parent context if parent UUID is provided
			if (options.parent) {
				const contextResult = await this.buildParentContext(authContext, options.parent);
				if (contextResult.isRight()) {
					instructions += "\n\n" + contextResult.value;
				}
				// If context building fails, continue without it (don't fail the whole request)
			}

			// Delegate to RAG agent with enhanced instructions
			const agentChatResult = await this.agentsService.chat(
				authContext,
				RAG_AGENT_UUID,
				text,
				{
					history: options.history,
					temperature: options.temperature,
					maxTokens: options.maxTokens,
					instructions,
				},
			);

			if (agentChatResult.isLeft()) {
				return left(agentChatResult.value);
			}

			return right(agentChatResult.value);
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
	// PRIVATE METHODS - INSTRUCTIONS BUILDING
	// ========================================================================

	/**
	 * Build enhanced RAG system instructions with search guidance
	 */
	private buildRAGInstructions(parent?: string): string {
		const scopeInfo = parent
			? `SEARCH SCOPE: Your search is limited to folder "${parent}" and its subfolders. When using the find tool, always include the filter: ["parent", "==", "${parent}"]`
			: "SEARCH SCOPE: You have access to search across the entire platform content.";

		return `**INSTRUCTIONS**

You are operating in RAG (Retrieval-Augmented Generation) mode for knowledge discovery within the Antbox ECM platform.

${scopeInfo}

SEARCH STRATEGY:
1. For semantic/conceptual queries, use the find tool with semantic search by prefixing your query with "?": "?user query"
2. For specific metadata searches, use targeted filters like: ["title", "contains", "keyword"] or ["mimetype", "==", "application/pdf"]
3. For fulltext searches without semantic understanding, use: ["fulltext", "match", "keyword"]
4. If initial search returns no results, try broader keyword searches using ["title", "contains", "keyword"] filters

SEARCH TOOLS AVAILABLE:
- find(filters): Search nodes using string queries (prefix with ? for semantic search) or NodeFilter arrays for metadata filtering
- get(uuid): Retrieve specific node details by UUID
- export(uuid): Get full content of a specific node

RESPONSE GUIDELINES:
- Always search for information before responding to user queries
- Use semantic search ("?query") as your primary method for conceptual questions
- Include relevant document UUIDs and titles in your responses
- If you find relevant documents, use get() or export() to retrieve more details when needed
- Be specific about what information you found and what sources it came from`;
	}

	/**
	 * Build parent node context including metadata and children list
	 */
	private async buildParentContext(
		authContext: AuthenticationContext,
		parentUuid: string,
	): Promise<Either<AntboxError, string>> {
		try {
			// Fetch parent node
			const parentResult = await this.nodeService.get(authContext, parentUuid);
			if (parentResult.isLeft()) {
				return left(parentResult.value);
			}

			const parentNode = parentResult.value;

			// Fetch children nodes
			const childrenResult = await this.nodeService.list(authContext, parentUuid);
			if (childrenResult.isLeft()) {
				return left(childrenResult.value);
			}

			const children = childrenResult.value;

			// Build context string
			let context = "**PARENT NODE CONTEXT**\n\n";
			context += "You are currently working within the context of a specific folder/node.\n\n";
			context += "**Parent Node Information:**\n";
			context += `- UUID: ${parentNode.uuid}\n`;
			context += `- Title: ${parentNode.title}\n`;
			context += `- Description: ${parentNode.description || "N/A"}\n`;
			context += `- Type: ${parentNode.mimetype}\n`;
			context += `- Owner: ${parentNode.owner}\n`;
			context += `- Created: ${parentNode.createdTime}\n`;
			context += `- Modified: ${parentNode.modifiedTime}\n`;

			// Add custom metadata if present
			const customMetadata: Partial<NodeMetadata> = { ...parentNode };
			// Remove standard fields
			delete customMetadata.uuid;
			delete customMetadata.title;
			delete customMetadata.description;
			delete customMetadata.mimetype;
			delete customMetadata.owner;
			delete customMetadata.createdTime;
			delete customMetadata.modifiedTime;
			delete customMetadata.parent;
			delete customMetadata.fid;

			if (Object.keys(customMetadata).length > 0) {
				context += "\n**Additional Metadata:**\n";
				context += JSON.stringify(customMetadata, null, 2) + "\n";
			}

			// Add children list
			context += "\n**Children Nodes:**\n";
			if (children.length === 0) {
				context += "This folder is currently empty.\n";
			} else {
				context += `Total: ${children.length} items\n\n`;
				for (const child of children) {
					context += `- **${child.title}** (${child.mimetype})\n`;
					context += `  UUID: ${child.uuid}\n`;
					if (child.description) {
						context += `  Description: ${child.description}\n`;
					}
					context += `  Modified: ${child.modifiedTime}\n`;
				}
			}

			context +=
				"\n**Note:** When referencing these nodes, use their UUIDs. You can use the get() or ocr() (if text file) tools to retrieve more details about specific nodes.";

			return right(context);
		} catch (error) {
			return left(
				new AntboxError("ContextBuildError", `Failed to build parent context: ${error}`),
			);
		}
	}
}
