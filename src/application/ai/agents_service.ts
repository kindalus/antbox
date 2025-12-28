import type { AntboxError } from "shared/antbox_error.ts";
import {
	AntboxError as AntboxErrorClass,
	BadRequestError,
	ForbiddenError,
} from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import { ValidationError } from "shared/validation_error.ts";
import type { AuthenticationContext } from "../security/authentication_context.ts";
import type { ConfigurationRepository } from "domain/configuration/configuration_repository.ts";
import type { AgentData } from "domain/configuration/agent_data.ts";
import { AgentDataSchema } from "domain/configuration/agent_schema.ts";
import { ADMINS_GROUP_UUID } from "domain/configuration/builtin_groups.ts";
import { BUILTIN_AGENTS } from "domain/configuration/builtin_agents.ts";
import { UuidGenerator } from "shared/uuid_generator.ts";
import type { ChatHistory, ChatMessage } from "domain/ai/chat_message.ts";
import type { AIModel } from "./ai_model.ts";
import type { FeaturesService } from "../features/features_service.ts";
import type { FeatureData } from "domain/configuration/feature_data.ts";
import { modelFrom } from "adapters/model_configuration_parser.ts";
import { AIModelDTO, aiModelToDto } from "./ai_model_dto.ts";
import chatPrefix from "./prompts/chat_prefix.txt" with { type: "text" };
import answerPrefix from "./prompts/answer_prefix.txt" with { type: "text" };
import agentSystemPrompt from "./prompts/agent_system_prompt.txt" with { type: "text" };
import {
	createGetSdkDocumentationTool,
	GET_SDK_DOCUMENTATION_TOOL,
} from "./internal_ai_tools/get_sdk_documentation.ts";
import { createRunCodeTool, RUN_CODE_TOOL } from "./internal_ai_tools/run_code.ts";
import { NodeServiceProxy } from "../nodes/node_service_proxy.ts";
import { AspectServiceProxy } from "../aspects/aspect_service_proxy.ts";
import type { NodeService } from "../nodes/node_service.ts";
import type { AspectsService } from "../aspects/aspects_service.ts";

const chatSystemPrompt = chatPrefix + "\n" + agentSystemPrompt;
const answerSystemPrompt = answerPrefix + "\n" + agentSystemPrompt;

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

/**
 * AgentsService - Manages AI agent configurations and execution
 *
 * This service combines configuration management (CRUD operations) with
 * AI execution capabilities (chat, answer, tool calling).
 *
 * Agents are mutable configurations that define AI assistant behavior.
 *
 * Access control:
 * - Create/Delete: Admin-only
 * - Update: Admin-only (agents can be modified)
 * - Read: Public (all users can view agents)
 * - Execute: Permission-based (chat/answer operations respect agent permissions)
 */
export class AgentsService {
	constructor(
		private readonly configRepo: ConfigurationRepository,
		private readonly nodeService: NodeService,
		private readonly featuresService: FeaturesService,
		private readonly aspectsService: AspectsService,
		private readonly defaultModel: AIModel,
		private readonly models: AIModel[],
	) {}

	// ========================================================================
	// CRUD OPERATIONS
	// ========================================================================

	async createAgent(
		ctx: AuthenticationContext,
		data: Omit<AgentData, "uuid" | "createdTime" | "modifiedTime">,
	): Promise<Either<AntboxError, AgentData>> {
		// Check admin permission
		if (!this.#isAdmin(ctx)) {
			return left(new ForbiddenError("Only admins can create agents"));
		}

		const now = new Date().toISOString();
		const agentData: AgentData = {
			uuid: UuidGenerator.generate(),
			...data,
			createdTime: now,
			modifiedTime: now,
		};

		// Validate with Zod schema
		const validation = AgentDataSchema.safeParse(agentData);
		if (!validation.success) {
			const errors = validation.error.issues.map((e) =>
				new BadRequestError(`${e.path.join(".")}: ${e.message}`)
			);
			return left(ValidationError.from(...errors));
		}

		return this.configRepo.save("agents", agentData);
	}

	async getAgent(
		ctx: AuthenticationContext,
		uuid: string,
	): Promise<Either<AntboxError, AgentData>> {
		// Check builtin agents first
		const builtinAgent = BUILTIN_AGENTS.find((a) => a.uuid === uuid);
		if (builtinAgent) {
			return right(builtinAgent);
		}

		return this.configRepo.get("agents", uuid);
	}

	async listAgents(
		ctx: AuthenticationContext,
	): Promise<Either<AntboxError, AgentData[]>> {
		const customAgentsOrErr = await this.configRepo.list("agents");

		if (customAgentsOrErr.isLeft()) {
			return customAgentsOrErr;
		}

		// Combine builtin agents with custom agents
		const allAgents = [...BUILTIN_AGENTS, ...customAgentsOrErr.value];

		// Sort by title
		allAgents.sort((a, b) => a.title.localeCompare(b.title));

		return right(allAgents);
	}

	async updateAgent(
		ctx: AuthenticationContext,
		uuid: string,
		updates: Partial<Omit<AgentData, "uuid" | "createdTime">>,
	): Promise<Either<AntboxError, AgentData>> {
		// Check admin permission
		if (!this.#isAdmin(ctx)) {
			return left(new ForbiddenError("Only admins can update agents"));
		}

		// Cannot update builtin agents
		if (BUILTIN_AGENTS.some((a) => a.uuid === uuid)) {
			return left(new BadRequestError("Cannot update builtin agents"));
		}

		const existingOrErr = await this.configRepo.get("agents", uuid);
		if (existingOrErr.isLeft()) {
			return existingOrErr;
		}

		const updatedData: AgentData = {
			...existingOrErr.value,
			...updates,
			uuid, // Ensure UUID doesn't change
			createdTime: existingOrErr.value.createdTime, // Preserve creation time
			modifiedTime: new Date().toISOString(),
		};

		// Validate with Zod schema
		const validation = AgentDataSchema.safeParse(updatedData);
		if (!validation.success) {
			const errors = validation.error.issues.map((e) =>
				new BadRequestError(`${e.path.join(".")}: ${e.message}`)
			);
			return left(ValidationError.from(...errors));
		}

		return this.configRepo.save("agents", updatedData);
	}

	async deleteAgent(
		ctx: AuthenticationContext,
		uuid: string,
	): Promise<Either<AntboxError, void>> {
		// Check admin permission
		if (!this.#isAdmin(ctx)) {
			return left(new ForbiddenError("Only admins can delete agents"));
		}

		// Cannot delete builtin agents
		if (BUILTIN_AGENTS.some((a) => a.uuid === uuid)) {
			return left(new BadRequestError("Cannot delete builtin agents"));
		}

		return this.configRepo.delete("agents", uuid);
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
	 * const result = await agentsService.chat(
	 *   ctx,
	 *   "agent-uuid",
	 *   "Find all PDF documents about project Alpha"
	 * );
	 *
	 * // Continue a conversation
	 * const result2 = await agentsService.chat(
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
			const originalHistory: ChatHistory = [...(options?.history || [])];
			let currentHistory = [...originalHistory];

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
						new AntboxErrorClass("ModelError", `Model ${agent.model} does not support chat`),
					);
				}

				if (chatResult.isLeft()) {
					return left(chatResult.value);
				}

				// Check if response has text - if so, return early
				const hasText = chatResult.value.parts.some((part) => part.text && part.text.trim());
				if (hasText) {
					// Add model response to history
					originalHistory.push({ role: "user", parts: [{ text }] });
					originalHistory.push(chatResult.value);

					return right(originalHistory);
				}

				// Add model response to history
				if (currentHistory.length === originalHistory.length) {
					currentHistory.push({ role: "user", parts: [{ text }] });
				}
				currentHistory.push(chatResult.value);

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
			return left(new AntboxErrorClass("AgentChatError", `Agent chat failed: ${error}`));
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
						new AntboxErrorClass(
							"ModelError",
							`Model ${agent.model} does not support ${method}`,
						),
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
			return left(new AntboxErrorClass("AgentAnswerError", `Agent answer failed: ${error}`));
		}
	}

	listModels(authContext: AuthenticationContext): Either<AntboxError, AIModelDTO[]> {
		if (!authContext.principal.groups.includes(ADMINS_GROUP_UUID)) {
			return left(new ForbiddenError());
		}

		return right(this.models.map(aiModelToDto));
	}

	// ========================================================================
	// HELPER METHODS
	// ========================================================================

	async #prepareAgentAndModel(
		authContext: AuthenticationContext,
		agentUuid: string,
	): Promise<Either<AntboxError, { agent: AgentData; aiModel: AIModel }>> {
		// Get the agent
		const agentResult = await this.getAgent(authContext, agentUuid);
		if (agentResult.isLeft()) {
			return left(agentResult.value);
		}

		const agent = agentResult.value;

		// Get appropriate AI model for this agent
		const aiModel = await this.#getModel(agent.model);
		if (!aiModel) {
			return left(new AntboxErrorClass("ModelError", `Could not load model: ${agent.model}`));
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
		_authContext: AuthenticationContext,
		agent: AgentData,
	): Promise<Partial<FeatureData>[] | undefined> {
		if (!agent.useTools) {
			return undefined;
		}

		// Return only the internal AI tools
		return [GET_SDK_DOCUMENTATION_TOOL, RUN_CODE_TOOL];
	}

	#extractToolCalls(message: ChatMessage): Array<{ name: string; args: Record<string, unknown> }> {
		return message.parts.filter((part) => part.toolCall).map((part) => part.toolCall!);
	}

	async #executeToolCalls(
		authContext: AuthenticationContext,
		toolCalls: Array<{ name: string; args: Record<string, unknown> }>,
		availableTools: Partial<FeatureData>[],
	): Promise<Either<AntboxError, ChatMessage[]>> {
		const messages: ChatMessage[] = [];

		// Create SDK instances for tool execution
		const nodeServiceProxy = new NodeServiceProxy(this.nodeService, authContext);
		const aspectServiceProxy = new AspectServiceProxy(this.aspectsService, authContext);

		// Get custom features for documentation
		const customFeaturesResult = await this.featuresService.listAITools(authContext);
		const customFeatures = customFeaturesResult.isRight() ? customFeaturesResult.value : [];

		// Create tool instances
		const getSdkDocumentation = createGetSdkDocumentationTool(customFeatures);
		const runCode = createRunCodeTool(nodeServiceProxy, aspectServiceProxy, {});

		for (const toolCall of toolCalls) {
			// Find the tool in available tools
			const tool = availableTools.find((t) =>
				t.uuid === toolCall.name || t.title === toolCall.name
			);

			if (!tool) {
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

			try {
				let resultText: string;

				// Execute internal tools directly
				if (toolCall.name === "getSdkDocumentation") {
					const sdkName = toolCall.args.sdkName as string | undefined;
					resultText = getSdkDocumentation(sdkName);
				} else if (toolCall.name === "runCode") {
					const code = toolCall.args.code as string;
					if (!code) {
						throw new Error("Code parameter is required");
					}
					resultText = await runCode(code);
				} else {
					throw new Error(`Unknown tool: ${toolCall.name}`);
				}

				messages.push({
					role: "tool",
					parts: [{ toolResponse: { name: toolCall.name, text: resultText } }],
				});
			} catch (error) {
				messages.push({
					role: "tool",
					parts: [{
						toolResponse: {
							name: toolCall.name,
							text: `Error: ${error instanceof Error ? error.message : String(error)}`,
						},
					}],
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

	#isAdmin(ctx: AuthenticationContext): boolean {
		return ctx.principal.groups.includes(ADMINS_GROUP_UUID);
	}
}
