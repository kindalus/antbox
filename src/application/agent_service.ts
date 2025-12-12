import { Either, left, right } from "shared/either.ts";
import { AntboxError, ForbiddenError } from "shared/antbox_error.ts";
import { AuthenticationContext } from "application/authentication_context.ts";
import { NodeService } from "application/node_service.ts";
import { FeatureService } from "application/feature_service.ts";
import { FeatureDTO } from "application/feature_dto.ts";
import { AgentNode } from "domain/ai/agent_node.ts";
import { AgentNotFoundError } from "domain/ai/agent_not_found_error.ts";
import { ChatHistory, ChatMessage } from "domain/ai/chat_message.ts";
import { NodeFilter } from "domain/nodes/node_filter.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { Folders } from "domain/nodes/folders.ts";
import { AIModel } from "application/ai_model.ts";
import { NodeMetadata } from "domain/nodes/node_metadata.ts";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";
import { AgentDTO, toAgentDTO } from "application/agent_dto.ts";
import { modelFrom } from "adapters/model_configuration_parser.ts";
import { BUILTIN_AGENT_TOOLS } from "./builtin_features/agent_tools.ts";
import { builtinAgents } from "./builtin_agents/index.ts";
import { AIModelDTO, aiModelToDto } from "./ai_model_dto.ts";
import { Groups } from "domain/users_groups/groups.ts";
const chatSystemPrompt =
	`You are an AI agent running inside Antbox, an ECM (Enterprise Content Management) platform.

Key concepts:
- Nodes: Everything is a node (files, folders, documents, users, groups, etc.)
- Aspects: Schema definitions that extend node properties with custom metadata
- NodeFilter: Powerful query system using [field, operator, value] tuples

You have access to these tools:
- find(filters): Search nodes using NodeFilter queries
- get(uuid): Retrieve a specific node by UUID
- export(uuid): Export node content

IMPORTANT:
- Always detect and respond in the same language as the user
- Only answer questions related to content and data within the Antbox platform
- If a question is outside the scope of the platform, respond: "I don't know how to answer that as it's outside the scope of this ECM platform"
- Many questions can be answered by querying node metadata and aspects using the find tool`;

const answerSystemPrompt =
	`You are an AI agent running inside Antbox, an ECM (Enterprise Content Management) platform.

Key concepts:
- Nodes: Everything is a node (files, folders, documents, users, groups, etc.)
- Aspects: Schema definitions that extend node properties with custom metadata
- NodeFilter: Powerful query system using [field, operator, value] tuples

You have access to these tools:
- find(filters): Search nodes using NodeFilter queries
- get(uuid): Retrieve a specific node by UUID
- export(uuid): Export node content

IMPORTANT:
- Only answer questions related to content and data within the Antbox platform
- If a question is outside the scope of the platform, respond: "I don't know how to answer that as it's outside the scope of this ECM platform"
- Many questions can be answered by querying node metadata and aspects using the find tool`;

// ============================================================================
// INPUT TYPES
// ============================================================================

/**
 * Options for agent chat execution
 */
export interface ChatOptions {
	readonly history?: ChatHistory;
	readonly files?: File[];
	readonly temperature?: number; // Override agent's default
	readonly maxTokens?: number; // Override agent's default
	readonly instructions?: string; // Additional system instructions
}

/**
 * Options for agent answer execution
 */
export interface AnswerOptions {
	readonly files?: File[];
	readonly temperature?: number; // Override agent's default
	readonly maxTokens?: number; // Override agent's default
	readonly instructions?: string; // Additional system instructions
}

// ============================================================================
// AGENT SERVICE CLASS
// ============================================================================

export class AgentService {
	constructor(
		private readonly nodeService: NodeService,
		private readonly featureService: FeatureService,
		private readonly defaultModel: AIModel,
		private readonly models: AIModel[],
	) {}

	// ========================================================================
	// CRUD OPERATIONS
	// ========================================================================

	/**
	 * Create or replace an agent
	 */
	async createOrReplace(
		authContext: AuthenticationContext,
		metadata: AgentDTO,
	): Promise<Either<AntboxError, AgentDTO>> {
		// Check if it's a builtin agent
		if (metadata.uuid) {
			const isBuiltin = builtinAgents.some((a) => a.uuid === metadata.uuid);
			if (isBuiltin) {
				return left(new AntboxError("ForbiddenError", "Cannot update built-in agent"));
			}

			// If UUID is provided, check if agent exists
			const existingAgent = await this.get(authContext, metadata.uuid);
			if (existingAgent.isRight()) {
				// Agent exists, update it
				return this.#update(authContext, metadata.uuid, metadata);
			}
		}

		// Agent doesn't exist or no UUID provided, create new one
		return this.#create(authContext, metadata);
	}

	/**
	 * Create a new agent
	 */
	async #create(
		authContext: AuthenticationContext,
		metadata: Partial<NodeMetadata>,
	): Promise<Either<AntboxError, AgentDTO>> {
		try {
			// Set defaults for agent properties if not provided
			const agentMetadata = {
				...metadata,
				model: metadata.model || "default",
				temperature: metadata.temperature ?? 0.7,
				maxTokens: metadata.maxTokens ?? 8192,
				reasoning: metadata.reasoning ?? false,
				useTools: metadata.useTools ?? false,
				owner: authContext.principal.email,
			};

			// Create the agent node
			const agentResult = AgentNode.create(agentMetadata);
			if (agentResult.isLeft()) {
				return left(agentResult.value);
			}

			const agent = agentResult.value;

			// Save via NodeService
			const saveResult = await this.nodeService.create(authContext, agent.metadata);
			if (saveResult.isLeft()) {
				return left(saveResult.value);
			}

			// Convert to DTO and return
			return right(toAgentDTO(agent));
		} catch (error) {
			return left(new AntboxError("AgentCreationError", `Failed to create agent: ${error}`));
		}
	}

	/**
	 * Get agent by UUID
	 */
	async get(
		authContext: AuthenticationContext,
		uuid: string,
	): Promise<Either<AntboxError, AgentDTO>> {
		// Check builtin agents first
		const builtinAgent = builtinAgents.find((a) => a.uuid === uuid);
		if (builtinAgent) {
			return right(builtinAgent);
		}

		// Check repository agents
		const nodeResult = await this.nodeService.get(authContext, uuid);
		if (nodeResult.isLeft()) {
			if (nodeResult.value instanceof NodeNotFoundError) {
				return left(new AgentNotFoundError(uuid));
			}
			return left(nodeResult.value);
		}

		const node = nodeResult.value;
		if (!Nodes.isAgent(node)) {
			return left(new AgentNotFoundError(uuid));
		}

		return right(toAgentDTO(node));
	}

	/**
	 * Update agent
	 */
	async #update(
		authContext: AuthenticationContext,
		uuid: string,
		metadata: Partial<NodeMetadata>,
	): Promise<Either<AntboxError, AgentDTO>> {
		// First get the existing agent
		const getResult = await this.get(authContext, uuid);
		if (getResult.isLeft()) {
			return left(getResult.value);
		}

		try {
			// Get the node
			const nodeResult = await this.nodeService.get(authContext, uuid);
			if (nodeResult.isLeft()) {
				return left(nodeResult.value);
			}

			const agent = nodeResult.value as AgentNode;

			// Keep metadata as-is - no need to resolve "default" during update
			const updateMetadata = { ...metadata };

			// Update the agent
			const updateResult = agent.update(updateMetadata);
			if (updateResult.isLeft()) {
				return left(updateResult.value);
			}

			// Save via NodeService
			const saveResult = await this.nodeService.update(authContext, agent.uuid, updateMetadata);
			if (saveResult.isLeft()) {
				return left(saveResult.value);
			}

			// Return updated DTO
			return right(toAgentDTO(agent));
		} catch (error) {
			return left(new AntboxError("AgentUpdateError", `Failed to update agent: ${error}`));
		}
	}

	/**
	 * Delete agent
	 */
	async delete(
		authContext: AuthenticationContext,
		uuid: string,
	): Promise<Either<AntboxError, void>> {
		// Check if it's a builtin agent
		const isBuiltin = builtinAgents.some((a) => a.uuid === uuid);
		if (isBuiltin) {
			return left(new AntboxError("ForbiddenError", "Cannot delete built-in agent"));
		}

		// Verify agent exists
		const getResult = await this.get(authContext, uuid);
		if (getResult.isLeft()) {
			return left(getResult.value);
		}

		// Delete via NodeService
		const deleteResult = await this.nodeService.delete(authContext, uuid);
		if (deleteResult.isLeft()) {
			return left(deleteResult.value);
		}

		return right(undefined);
	}

	/**
	 * List agents with optional filtering
	 */
	async list(
		authContext: AuthenticationContext,
	): Promise<Either<AntboxError, AgentDTO[]>> {
		// Build filters for agents
		const agentFilters: NodeFilter[] = [
			["mimetype", "==", Nodes.AGENT_MIMETYPE],
			["parent", "==", Folders.AGENTS_FOLDER_UUID],
		];

		// Find agents
		const findResult = await this.nodeService.find(
			authContext,
			agentFilters,
			Number.MAX_SAFE_INTEGER,
		);

		if (findResult.isLeft()) {
			return left(findResult.value);
		}

		// Retrieve builtin agents and convert to DTOs
		const agents = [...findResult.value.nodes, ...builtinAgents]
			.filter((node) => Nodes.isAgent(node))
			.map((node) => toAgentDTO(node));

		return right(agents);
	}

	// ========================================================================
	// EXECUTION METHODS
	// ========================================================================

	/**
	 * Execute an interactive chat session with an AI agent.
	 *
	 * This is a complex method that orchestrates AI agent conversations with tool calling support.
	 * It handles multi-turn conversations where the agent can call tools (features) to gather
	 * information or perform actions before responding to the user.
	 *
	 * **Chat Flow:**
	 * 1. **Agent & Model Preparation**: Loads the agent configuration and resolves the AI model
	 * 2. **System Prompt Construction**: Builds system instructions (only for new conversations)
	 * 3. **History Management**: Merges provided history with the new user message
	 * 4. **Tool Preparation**: Loads available tools based on agent configuration
	 * 5. **Tool Calling Loop**: Repeatedly interacts with the AI model:
	 *    - Model generates a response (may include tool calls)
	 *    - If tool calls are present, executes them and adds results to history
	 *    - Continues until the model returns a text response without tool calls
	 * 6. **History Return**: Returns the complete conversation history including tool interactions
	 *
	 * **Tool Calling Support:**
	 * - The agent can call built-in tools (NodeService methods) or custom features
	 * - Tool results are automatically added to the conversation history
	 * - The loop continues until the agent produces a final text response
	 *
	 * **Options:**
	 * - `history`: Previous conversation turns to continue a session
	 * - `files`: Attach files (images, documents) to the user message
	 * - `temperature`: Override agent's default creativity setting
	 * - `maxTokens`: Override agent's default response length
	 * - `instructions`: Additional one-time instructions for this turn
	 *
	 * @param authContext - Authentication context (permissions apply to all tool calls)
	 * @param agentUuid - UUID of the agent to chat with
	 * @param text - The user's message/question
	 * @param options - Optional configuration for this chat turn
	 * @returns Either an error or the complete chat history including the agent's response
	 *
	 * @example
	 * ```typescript
	 * // Start a new conversation
	 * const result = await agentService.chat(
	 *   ctx,
	 *   "agent-uuid",
	 *   "Find all PDF documents about project Alpha"
	 * );
	 *
	 * // Continue a conversation
	 * const result2 = await agentService.chat(
	 *   ctx,
	 *   "agent-uuid",
	 *   "Summarize the first document",
	 *   { history: result.value }
	 * );
	 * ```
	 */
	async chat(
		authContext: AuthenticationContext,
		agentUuid: string,
		text: string,
		options?: ChatOptions,
	): Promise<Either<AntboxError, ChatHistory>> {
		// Prepare agent and model
		const prepareResult = await this.#prepareAgentAndModel(authContext, agentUuid);
		if (prepareResult.isLeft()) {
			return left(prepareResult.value);
		}

		const { agent, aiModel } = prepareResult.value;

		try {
			// Build system prompt only if no history provided (new conversation)
			let systemPrompt: string | undefined;
			if (!options?.history || options.history.length === 0) {
				systemPrompt = this.#buildSystemPrompt(
					chatSystemPrompt,
					agent.systemInstructions,
					options?.instructions,
				);
			}

			// Initialize conversation history with previous turns + new message
			let currentHistory: ChatHistory = [
				...(options?.history || []),
				{ role: "user", parts: [{ text }] },
			];

			// Prepare tools that the agent can call
			const tools = await this.#prepareTools(authContext, agent);

			// Tool calling loop: continue until we get a text response
			while (true) {
				// Execute chat via AI model
				const chatResult = await aiModel.chat?.(
					text,
					{
						systemPrompt,
						history: currentHistory,
						tools,
						files: options?.files,
						temperature: options?.temperature ?? agent.temperature,
						maxTokens: options?.maxTokens ?? agent.maxTokens,
						reasoning: agent.reasoning,
						structuredOutput: agent.structuredAnswer,
					},
				);

				if (!chatResult) {
					return left(
						new AntboxError("ModelError", `Model ${agent.model} does not support chat`),
					);
				}

				if (chatResult.isLeft()) {
					return left(chatResult.value);
				}

				// Add model response to history
				currentHistory = [...currentHistory, chatResult.value];

				// Check if response has text - if so, return early
				const hasText = chatResult.value.parts.some((part) => part.text && part.text.trim());
				if (hasText) {
					return right(currentHistory);
				}

				// Extract tool calls from the response
				const toolCalls = this.#extractToolCalls(chatResult.value);
				if (toolCalls.length === 0 || !tools) {
					// No tool calls and no text - return what we have
					return right(currentHistory);
				}

				// Execute tool calls and add results to history
				const toolExecutionResult = await this.#executeToolCalls(
					authContext,
					toolCalls,
					tools,
				);

				if (toolExecutionResult.isLeft()) {
					return left(toolExecutionResult.value);
				}

				// Add tool messages to history
				const toolMessages = toolExecutionResult.value;
				currentHistory = [...currentHistory, ...toolMessages];
			}
		} catch (error) {
			return left(new AntboxError("AgentChatError", `Agent chat failed: ${error}`));
		}
	}

	/**
	 * Execute agent answer (one-shot question answering)
	 */
	async answer(
		authContext: AuthenticationContext,
		agentUuid: string,
		text: string,
		options?: AnswerOptions,
	): Promise<Either<AntboxError, ChatMessage>> {
		// Prepare agent and model
		const prepareResult = await this.#prepareAgentAndModel(authContext, agentUuid);
		if (prepareResult.isLeft()) {
			return left(prepareResult.value);
		}

		const { agent, aiModel } = prepareResult.value;

		try {
			// Build system prompt
			const systemPrompt = this.#buildSystemPrompt(
				answerSystemPrompt,
				agent.systemInstructions,
				options?.instructions,
			);

			// Prepare tools
			const tools = await this.#prepareTools(authContext, agent);

			// Build initial history for tool execution loop
			let currentHistory: ChatHistory = [
				{ role: "user", parts: [{ text }] },
			];

			// Loop until we get a response with text or encounter an error
			while (true) {
				// Execute answer/chat via AI model
				const result = currentHistory.length === 1
					? await aiModel.answer?.(
						text,
						{
							systemPrompt,
							tools,
							files: options?.files,
							temperature: options?.temperature ?? agent.temperature,
							maxTokens: options?.maxTokens ?? agent.maxTokens,
							reasoning: agent.reasoning,
							structuredOutput: agent.structuredAnswer,
						},
					)
					: await aiModel.chat?.(
						"Continue based on the tool results",
						{
							systemPrompt,
							history: currentHistory,
							tools,
							temperature: options?.temperature ?? agent.temperature,
							maxTokens: options?.maxTokens ?? agent.maxTokens,
							reasoning: agent.reasoning,
							structuredOutput: agent.structuredAnswer,
						},
					);

				if (!result) {
					const method = currentHistory.length === 1 ? "answer" : "chat";
					return left(
						new AntboxError("ModelError", `Model ${agent.model} does not support ${method}`),
					);
				}

				if (result.isLeft()) {
					return left(result.value);
				}

				const currentMessage = result.value;

				// Check if response has text - if so, return early
				const hasText = currentMessage.parts
					.some((part) => part.text && part.text.trim());

				if (hasText) {
					return right(currentMessage);
				}

				// Extract tool calls from the response
				const toolCalls = this.#extractToolCalls(currentMessage);
				if (toolCalls.length === 0 || !tools) {
					// No tool calls and no text - return what we have
					return right(currentMessage);
				}

				// Add current message to history
				currentHistory = [...currentHistory, currentMessage];

				// Execute tool calls and add results to history
				const toolExecutionResult = await this.#executeToolCalls(
					authContext,
					toolCalls,
					tools,
				);

				if (toolExecutionResult.isLeft()) {
					return left(toolExecutionResult.value);
				}

				// Add tool messages to history
				const toolMessages = toolExecutionResult.value;
				currentHistory = [...currentHistory, ...toolMessages];
			}
		} catch (error) {
			return left(new AntboxError("AgentAnswerError", `Agent answer failed: ${error}`));
		}
	}

	listModels(authContext: AuthenticationContext): Either<AntboxError, AIModelDTO[]> {
		if (!authContext.principal.groups.includes(Groups.ADMINS_GROUP_UUID)) {
			return left(new ForbiddenError());
		}

		return right(this.models.map(aiModelToDto));
	}

	/**
	 * Execute tool calls and return chat messages with results
	 */
	// ========================================================================
	// COMMON HELPER METHODS
	// ========================================================================

	async #prepareAgentAndModel(
		authContext: AuthenticationContext,
		agentUuid: string,
	): Promise<Either<AntboxError, { agent: AgentDTO; aiModel: AIModel }>> {
		// Get the agent
		const agentResult = await this.get(authContext, agentUuid);
		if (agentResult.isLeft()) {
			return left(agentResult.value);
		}

		const agent = agentResult.value;

		// Get appropriate AI model for this agent
		const aiModel = await this.#getModel(agent.model);
		if (!aiModel) {
			return left(new AntboxError("ModelError", `Could not load model: ${agent.model}`));
		}

		return right({ agent, aiModel });
	}

	#buildSystemPrompt(
		basePrompt: string,
		systemInstructions: string,
		additionalInstructions?: string,
	): string {
		let systemPrompt = basePrompt + "\n\n" + systemInstructions;
		if (additionalInstructions) {
			systemPrompt += "\n\n**INSTRUCTIONS**\n\n" + additionalInstructions;
		}
		return systemPrompt;
	}

	async #prepareTools(
		authContext: AuthenticationContext,
		agent: AgentDTO,
	): Promise<Partial<FeatureDTO>[] | undefined> {
		if (!agent.useTools) {
			return undefined;
		}

		// Add all available custom tools
		const result = await this.#getAllAvailableTools(authContext);

		if (result.isLeft()) {
			return undefined;
		}

		const finalTools = [...BUILTIN_AGENT_TOOLS, ...result.value]
			.map((t) => ({ ...t, name: t.uuid }));

		return finalTools;
	}

	#extractToolCalls(message: ChatMessage): Array<{ name: string; args: Record<string, unknown> }> {
		return message.parts.filter((part) => part.toolCall).map((part) => part.toolCall!);
	}

	async #executeToolCalls(
		authContext: AuthenticationContext,
		toolCalls: Array<{ name: string; args: Record<string, unknown> }>,
		availableTools: Partial<FeatureDTO>[],
	): Promise<Either<AntboxError, ChatMessage[]>> {
		const messages: ChatMessage[] = [];

		for (const toolCall of toolCalls) {
			// Find the tool in available tools
			const tool = availableTools.find((t) => t.name === toolCall.name);
			const toolId = tool?.uuid;

			if (!tool || !toolId) {
				messages.push({
					role: "tool",
					parts: [{
						toolResponse: {
							name: toolCall.name,
							text: `Error: Tool ${toolCall.name} not found`,
						},
					}],
				});
				continue;
			}

			// Create AI authentication context for tool execution
			const aiAuthContext: AuthenticationContext = {
				tenant: authContext.tenant,
				principal: authContext.principal,
				mode: "AI",
			};

			// Execute the tool via FeatureService
			const executeResult = await this.featureService.runAITool(
				aiAuthContext,
				toolId,
				toolCall.args,
			);

			// Add result to messages
			if (executeResult.isLeft()) {
				messages.push({
					role: "tool",
					parts: [{
						toolResponse: {
							name: toolCall.name,
							text: `Error executing ${toolCall.name}: ${executeResult.value.message}`,
						},
					}],
				});
			} else {
				const result = executeResult.value;
				const resultText = typeof result === "string" ? result : JSON.stringify(result);

				messages.push({
					role: "tool",
					parts: [{ toolResponse: { name: toolCall.name, text: resultText } }],
				});
			}
		}

		return right(messages);
	}

	/**
	 * Get the appropriate AI model for the given model name
	 */
	async #getModel(modelName: string): Promise<AIModel | undefined> {
		// Use default model instance for "default" model name
		if (modelName === "default") {
			return this.defaultModel;
		}

		// For other models, construct using modelFrom
		// We need to handle the case where modelFrom might call Deno.exit
		// by catching any process exit attempts and treating them as failures
		try {
			const originalExit = Deno.exit;
			let exitCalled = false;

			// Temporarily override Deno.exit to catch exit attempts
			Deno.exit = (code?: number) => {
				exitCalled = true;
				throw new Error(`Model loading failed with exit code: ${code ?? 0}`);
			};

			try {
				const model = await modelFrom([modelName]);
				return model;
			} finally {
				// Restore original exit function
				Deno.exit = originalExit;
				if (exitCalled) {
					console.error(
						`Failed to load model ${modelName}: Model loading attempted to exit process`,
					);
				}
			}
		} catch (error) {
			console.error(`Failed to load model ${modelName}:`, error);
			// Fall back to default model instance when model loading fails
			// This provides better resilience and enables testing
			console.warn(`Falling back to default model instance for ${modelName}`);
			return this.defaultModel;
		}
	}

	/**
	 * Get all available AI tools for the authenticated user
	 */
	#getAllAvailableTools(
		authContext: AuthenticationContext,
	): Promise<Either<AntboxError, Partial<FeatureDTO>[]>> {
		try {
			return this.featureService.listAITools(authContext);
		} catch (error) {
			return Promise.resolve(left(
				new AntboxError("ToolRetrievalError", `Failed to get available tools: ${error}`),
			));
		}
	}
}
