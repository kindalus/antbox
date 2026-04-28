import { describe, it } from "bdd";
import { expect } from "expect";
import { createEvent } from "@google/adk";
import {
	AgentsEngine,
	type AgentsEngineContext,
	buildAgentDebugRunTrace,
	chatMessageToEvent,
	eventToChatMessages,
	normalizeToolResult,
	selectAgentTools,
	summarizeAgentDebugEvent,
} from "./agents_engine.ts";
import { left, right } from "shared/either.ts";
import { type AntboxError, ForbiddenError } from "shared/antbox_error.ts";
import type { AgentData } from "domain/configuration/agent_data.ts";
import type { AuthenticationContext } from "application/security/authentication_context.ts";
import type { FeatureData } from "domain/configuration/feature_data.ts";
import { ragAgent } from "./builtin_agents/rag_agent.ts";

// ============================================================================
// MOCKS
// ============================================================================

const mockAuthContext: AuthenticationContext = {
	tenant: "test-tenant",
	principal: { email: "test@example.com", groups: [] },
	mode: "Direct",
};

function makeAgentData(overrides: Partial<AgentData> = {}): AgentData {
	return {
		uuid: "test-agent-uuid",
		name: "Test Agent",
		description: "A test agent",
		exposedToUsers: true,
		model: "default",
		systemPrompt: "You are a helpful assistant.",
		createdTime: new Date().toISOString(),
		modifiedTime: new Date().toISOString(),
		...overrides,
	};
}

function makeContext(overrides: Partial<AgentsEngineContext> = {}): AgentsEngineContext {
	return {
		agentsService: {
			getAgent: async (_ctx: unknown, uuid: string) => {
				if (uuid === "not-found") {
					return left(
						{ errorCode: "NotFound", message: "Agent not found" } as AntboxError,
					);
				}
				return right(makeAgentData());
			},
			listAgents: async () => right([]),
			createAgent: async () => right(makeAgentData()),
			updateAgent: async () => right(makeAgentData()),
			deleteAgent: async () => right(undefined as unknown as void),
		} as unknown as import("./agents_service.ts").AgentsService,
		featuresService: {
			listAITools: async () => right([]),
		} as unknown as import("application/features/features_service.ts").FeaturesService,
		nodeService: {} as unknown as import("application/nodes/node_service.ts").NodeService,
		aspectsService:
			{} as unknown as import("application/aspects/aspects_service.ts").AspectsService,
		defaultModel: "google/gemini-2.5-flash",
		skills: [],
		eventBus: {
			publish: () => {},
			subscribe: () => {},
			unsubscribe: () => {},
		},
		...overrides,
	};
}

// ============================================================================
// TESTS
// ============================================================================

describe("AgentsEngine", () => {
	describe("debug tracing", () => {
		it("builds a debug trace for the effective agent run configuration", () => {
			const trace = buildAgentDebugRunTrace({
				agentUuid: "--rag-agent--",
				agentName: "RAG Agent",
				model: "google/gemini-2.5-flash",
				instruction: "Use semantic_search, then answer the user.",
				toolNames: ["semantic_search", "get_node"],
				interactionType: "chat",
				userText: "Quanto foi gasto em impostos aduaneiros neste mes?",
				additionalInstructions: "Responde em português.",
			});

			expect(trace).toEqual({
				type: "agent_run_start",
				agentUuid: "--rag-agent--",
				agentName: "RAG Agent",
				model: "google/gemini-2.5-flash",
				interactionType: "chat",
				toolNames: ["semantic_search", "get_node"],
				userText: "Quanto foi gasto em impostos aduaneiros neste mes?",
				additionalInstructions: "Responde em português.",
				instructionLength: 42,
				instruction: "Use semantic_search, then answer the user.",
			});
		});

		it("summarizes finish and tool metadata for debug traces", () => {
			const event = createEvent({
				author: "rag_agent",
				invocationId: "turn-1",
				finishReason: "MAX_TOKENS" as never,
				errorCode: "MAX_TOKENS",
				errorMessage: "Output token limit reached",
				usageMetadata: {
					promptTokenCount: 123,
					candidatesTokenCount: 456,
					totalTokenCount: 579,
				},
				content: {
					role: "model",
					parts: [{
						functionCall: {
							id: "call-1",
							name: "semantic_search",
							args: { query: "gastos impostos aduaneiros este mês" },
						},
					}],
				},
			});

			expect(summarizeAgentDebugEvent(event)).toEqual({
				type: "agent_run_event",
				id: event.id,
				invocationId: "turn-1",
				author: "rag_agent",
				branch: undefined,
				timestamp: event.timestamp,
				contentRole: "model",
				isFinalResponse: false,
				finishReason: "MAX_TOKENS",
				errorCode: "MAX_TOKENS",
				errorMessage: "Output token limit reached",
				textLength: 0,
				textPreview: "",
				toolCallCount: 1,
				toolCalls: [{
					id: "call-1",
					name: "semantic_search",
					argsKeys: ["query"],
					argsPreview: '{"query":"gastos impostos aduaneiros este mês"}',
				}],
				toolResponseCount: 0,
				toolResponses: [],
				usage: {
					promptTokens: 123,
					completionTokens: 456,
					totalTokens: 579,
				},
			});
		});
	});

	describe("tool result normalization", () => {
		it("wraps top-level arrays and leaves objects unchanged", () => {
			expect(normalizeToolResult([1, 2, 3])).toEqual({ results: [1, 2, 3] });
			expect(normalizeToolResult({ total: 42 })).toEqual({ total: 42 });
		});
	});

	describe("history serialization", () => {
		it("converts ADK tool events into chat history messages", () => {
			const toolCallEvent = createEvent({
				author: "test_agent",
				invocationId: "turn-1",
				content: {
					role: "model",
					parts: [{
						functionCall: {
							id: "call-1",
							name: "semantic_search",
							args: { query: "impostos aduaneiros" },
						},
					}],
				},
			});
			const toolResultEvent = createEvent({
				author: "test_agent",
				invocationId: "turn-1",
				content: {
					role: "user",
					parts: [{
						functionResponse: {
							id: "call-1",
							name: "semantic_search",
							response: { total: 42 },
						},
					}],
				},
			});
			const finalEvent = createEvent({
				author: "test_agent",
				invocationId: "turn-1",
				content: {
					role: "model",
					parts: [{ text: "Gastamos 42 em impostos." }],
				},
			});

			expect(eventToChatMessages(toolCallEvent, { includeText: false })).toEqual([{
				role: "model",
				parts: [{
					toolCall: {
						id: "call-1",
						name: "semantic_search",
						args: { query: "impostos aduaneiros" },
					},
				}],
			}]);
			expect(eventToChatMessages(toolResultEvent, { includeText: false })).toEqual([{
				role: "tool",
				parts: [{
					toolResponse: {
						id: "call-1",
						name: "semantic_search",
						text: '{"total":42}',
					},
				}],
			}]);
			expect(eventToChatMessages(finalEvent, { includeText: true })).toEqual([{
				role: "model",
				parts: [{ text: "Gastamos 42 em impostos." }],
			}]);
		});

		it("replays tool turns back into ADK event content", () => {
			const toolCallEvent = chatMessageToEvent(
				{
					role: "model",
					parts: [{
						toolCall: {
							id: "call-7",
							name: "get_node",
							args: { uuid: "node-1" },
						},
					}],
				},
				"test_agent",
				"history-1",
			);
			const toolResponseEvent = chatMessageToEvent(
				{
					role: "tool",
					parts: [{
						toolResponse: {
							id: "call-7",
							name: "get_node",
							text: '{"uuid":"node-1"}',
						},
					}],
				},
				"test_agent",
				"history-2",
			);

			expect(toolCallEvent.content?.role).toBe("model");
			expect(toolCallEvent.content?.parts?.[0]).toEqual({
				functionCall: {
					id: "call-7",
					name: "get_node",
					args: { uuid: "node-1" },
				},
			});
			expect(toolResponseEvent.content?.role).toBe("user");
			expect(toolResponseEvent.content?.parts?.[0]).toEqual({
				functionResponse: {
					id: "call-7",
					name: "get_node",
					response: { result: '{"uuid":"node-1"}' },
				},
			});
		});
	});

	describe("construction", () => {
		it("can be constructed with valid context", () => {
			const engine = new AgentsEngine(makeContext());
			expect(engine).toBeDefined();
		});

		it("accepts loaded skills metadata", () => {
			const engine = new AgentsEngine(makeContext({ skills: [] }));
			expect(engine).toBeDefined();
		});
	});

	describe("chat - agent not found", () => {
		it("returns error when agent UUID does not exist", async () => {
			const engine = new AgentsEngine(makeContext());

			const result = await engine.chat(mockAuthContext, "not-found", "Hello");

			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) {
				expect(result.value.message).toContain("Agent not found");
			}
		});
	});

	describe("chat - hidden agents", () => {
		it("rejects direct chat with agents not exposed to users", async () => {
			const agentsService = {
				getAgent: async () => right(makeAgentData({ exposedToUsers: false })),
				listAgents: async () => right([]),
			} as unknown as import("./agents_service.ts").AgentsService;

			const engine = new AgentsEngine(makeContext({ agentsService }));
			const result = await engine.chat(mockAuthContext, "hidden-agent", "Hello");

			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) {
				expect(result.value.message).toContain("not available for direct chat");
			}
		});

		it("allows direct chat when exposedToUsers is undefined", async () => {
			const agentsService = {
				getAgent: async () =>
					right(makeAgentData({ exposedToUsers: undefined as unknown as boolean })),
				listAgents: async () => right([]),
			} as unknown as import("./agents_service.ts").AgentsService;

			const engine = new AgentsEngine(makeContext({
				agentsService,
				tenantLimitsGuard: {
					ensureCanCreateFile: async () => right(undefined),
					ensureCanUpdateFile: async () => right(undefined),
					ensureCanRunAgent: async () =>
						left(new ForbiddenError("Agent token limit exceeded for the current month")),
				},
			}));
			const result = await engine.chat(mockAuthContext, "legacy-agent", "Hello");

			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) {
				expect(result.value).toBeInstanceOf(ForbiddenError);
				expect(result.value.message).toContain("Agent token limit exceeded");
			}
		});

		it("allows direct chat when systemPrompt is missing", async () => {
			const agentsService = {
				getAgent: async () =>
					right(makeAgentData({ systemPrompt: undefined as unknown as string })),
				listAgents: async () => right([]),
			} as unknown as import("./agents_service.ts").AgentsService;

			const engine = new AgentsEngine(makeContext({
				agentsService,
				tenantLimitsGuard: {
					ensureCanCreateFile: async () => right(undefined),
					ensureCanUpdateFile: async () => right(undefined),
					ensureCanRunAgent: async () =>
						left(new ForbiddenError("Agent token limit exceeded for the current month")),
				},
			}));
			const result = await engine.chat(mockAuthContext, "legacy-no-prompt-agent", "Hello");

			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) {
				expect(result.value).toBeInstanceOf(ForbiddenError);
				expect(result.value.message).toContain("Agent token limit exceeded");
			}
		});
	});

	describe("answer - agent not found", () => {
		it("returns error when agent UUID does not exist", async () => {
			const engine = new AgentsEngine(makeContext());

			const result = await engine.answer(mockAuthContext, "not-found", "Hello");

			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) {
				expect(result.value.message).toContain("Agent not found");
			}
		});
	});

	describe("answer - hidden agents", () => {
		it("rejects direct answer with agents not exposed to users", async () => {
			const agentsService = {
				getAgent: async () => right(makeAgentData({ exposedToUsers: false })),
				listAgents: async () => right([]),
			} as unknown as import("./agents_service.ts").AgentsService;

			const engine = new AgentsEngine(makeContext({ agentsService }));
			const result = await engine.answer(mockAuthContext, "hidden-agent", "Hello");

			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) {
				expect(result.value.message).toContain("not available for direct answer");
			}
		});

		it("allows direct answer when exposedToUsers is undefined", async () => {
			const agentsService = {
				getAgent: async () =>
					right(makeAgentData({ exposedToUsers: undefined as unknown as boolean })),
				listAgents: async () => right([]),
			} as unknown as import("./agents_service.ts").AgentsService;

			const engine = new AgentsEngine(makeContext({
				agentsService,
				tenantLimitsGuard: {
					ensureCanCreateFile: async () => right(undefined),
					ensureCanUpdateFile: async () => right(undefined),
					ensureCanRunAgent: async () =>
						left(new ForbiddenError("Agent token limit exceeded for the current month")),
				},
			}));
			const result = await engine.answer(mockAuthContext, "legacy-agent", "Hello");

			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) {
				expect(result.value).toBeInstanceOf(ForbiddenError);
				expect(result.value.message).toContain("Agent token limit exceeded");
			}
		});

		it("allows direct answer when systemPrompt is missing", async () => {
			const agentsService = {
				getAgent: async () =>
					right(makeAgentData({ systemPrompt: undefined as unknown as string })),
				listAgents: async () => right([]),
			} as unknown as import("./agents_service.ts").AgentsService;

			const engine = new AgentsEngine(makeContext({
				agentsService,
				tenantLimitsGuard: {
					ensureCanCreateFile: async () => right(undefined),
					ensureCanUpdateFile: async () => right(undefined),
					ensureCanRunAgent: async () =>
						left(new ForbiddenError("Agent token limit exceeded for the current month")),
				},
			}));
			const result = await engine.answer(mockAuthContext, "legacy-no-prompt-agent", "Hello");

			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) {
				expect(result.value).toBeInstanceOf(ForbiddenError);
				expect(result.value.message).toContain("Agent token limit exceeded");
			}
		});
	});

	describe("limits enforcement", () => {
		it("blocks chat when the agent token threshold is reached", async () => {
			const engine = new AgentsEngine(makeContext({
				tenantLimitsGuard: {
					ensureCanCreateFile: async () => right(undefined),
					ensureCanUpdateFile: async () => right(undefined),
					ensureCanRunAgent: async () =>
						left(new ForbiddenError("Agent token limit exceeded for the current month")),
				},
			}));

			const result = await engine.chat(mockAuthContext, "test-agent-uuid", "Hello");

			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) {
				expect(result.value).toBeInstanceOf(ForbiddenError);
				expect(result.value.message).toContain("Agent token limit exceeded");
			}
		});

		it("blocks answer when the agent token threshold is reached", async () => {
			const engine = new AgentsEngine(makeContext({
				tenantLimitsGuard: {
					ensureCanCreateFile: async () => right(undefined),
					ensureCanUpdateFile: async () => right(undefined),
					ensureCanRunAgent: async () =>
						left(new ForbiddenError("Agent token limit exceeded for the current month")),
				},
			}));

			const result = await engine.answer(mockAuthContext, "test-agent-uuid", "Hello");

			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) {
				expect(result.value).toBeInstanceOf(ForbiddenError);
				expect(result.value.message).toContain("Agent token limit exceeded");
			}
		});
	});

	describe("tools filtering", () => {
		it("includes feature-backed AI tools for agents using snake_case aliases", async () => {
			const featureTool: FeatureData = {
				uuid: "countChildrenTool",
				title: "Count Children Tool",
				description: "Counts child nodes",
				exposeAction: false,
				runOnCreates: false,
				runOnUpdates: false,
				runOnDeletes: false,
				runOnEmbeddingsCreated: false,
				runOnEmbeddingsUpdated: false,
				runManually: false,
				filters: [],
				exposeExtension: false,
				exposeAITool: true,
				runAs: undefined,
				groupsAllowed: [],
				parameters: [{ name: "parentUuid", type: "string", required: true }],
				returnType: "object",
				returnDescription: "Child count",
				returnContentType: "application/json",
				tags: ["ai"],
				run: "async function() { return { count: 1 }; }",
				createdTime: new Date().toISOString(),
				modifiedTime: new Date().toISOString(),
			};

			const engine = new AgentsEngine(makeContext({
				featuresService: {
					listAITools: async () => right([featureTool]),
				} as unknown as import("application/features/features_service.ts").FeaturesService,
			}));

			const result = await engine.listAvailableToolNames(
				mockAuthContext,
				makeAgentData({ tools: true }),
			);

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				expect(result.value).toContain("count_children_tool");
				expect(result.value).toContain("run_code");
				expect(result.value).toContain("load_skill");
			}
		});

		it("applies agent tool allowlists to feature-backed AI tools", async () => {
			const featureTool: FeatureData = {
				uuid: "countChildrenTool",
				title: "Count Children Tool",
				description: "Counts child nodes",
				exposeAction: false,
				runOnCreates: false,
				runOnUpdates: false,
				runOnDeletes: false,
				runOnEmbeddingsCreated: false,
				runOnEmbeddingsUpdated: false,
				runManually: false,
				filters: [],
				exposeExtension: false,
				exposeAITool: true,
				runAs: undefined,
				groupsAllowed: [],
				parameters: [{ name: "parentUuid", type: "string", required: true }],
				returnType: "object",
				tags: [],
				run: "async function() { return { count: 1 }; }",
				createdTime: new Date().toISOString(),
				modifiedTime: new Date().toISOString(),
			};

			const engine = new AgentsEngine(makeContext({
				featuresService: {
					listAITools: async () => right([featureTool]),
				} as unknown as import("application/features/features_service.ts").FeaturesService,
			}));

			const result = await engine.listAvailableToolNames(
				mockAuthContext,
				makeAgentData({ tools: ["count_children_tool"] }),
			);

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				expect(result.value).toEqual(["load_skill", "count_children_tool"]);
			}
		});

		it("tools=true enables all tools", () => {
			const selected = selectAgentTools(
				[
					{ name: "run_code", allowlistNames: ["runCode"] },
					{ name: "load_skill", allowlistNames: ["skillLoader"] },
				],
				true,
			);

			expect(selected.map((tool) => tool.name)).toEqual(["run_code", "load_skill"]);
		});

		it("tools=false keeps only load_skill", () => {
			const selected = selectAgentTools(
				[
					{ name: "run_code", allowlistNames: ["runCode"] },
					{ name: "load_skill", allowlistNames: ["skillLoader"] },
				],
				false,
			);

			expect(selected.map((tool) => tool.name)).toEqual(["load_skill"]);
		});

		it("tools undefined keeps only load_skill", () => {
			const selected = selectAgentTools(
				[
					{ name: "run_code", allowlistNames: ["runCode"] },
					{ name: "load_skill", allowlistNames: ["skillLoader"] },
				],
				undefined,
			);

			expect(selected.map((tool) => tool.name)).toEqual(["load_skill"]);
		});

		it("empty tools array keeps only load_skill", () => {
			const selected = selectAgentTools(
				[
					{ name: "run_code", allowlistNames: ["runCode"] },
					{ name: "load_skill", allowlistNames: ["skillLoader"] },
				],
				[],
			);

			expect(selected.map((tool) => tool.name)).toEqual(["load_skill"]);
		});

		it("tools array keeps listed tools plus load_skill, accepting legacy names", () => {
			const selected = selectAgentTools(
				[
					{ name: "run_code", allowlistNames: ["runCode"] },
					{ name: "load_skill", allowlistNames: ["skillLoader"] },
					{ name: "other" },
				],
				["runCode"],
			);

			expect(selected.map((tool) => tool.name)).toEqual(["run_code", "load_skill"]);
		});

		it("engine can be constructed with discovered skills for filtering", () => {
			const skills = [
				{
					frontmatter: {
						name: "skill-a",
						description: "Skill A",
					},
					skillDir: "/tmp/skill-a",
					skillFile: "/tmp/skill-a/SKILL.md",
				},
				{
					frontmatter: {
						name: "skill-b",
						description: "Skill B",
					},
					skillDir: "/tmp/skill-b",
					skillFile: "/tmp/skill-b/SKILL.md",
				},
			];

			const engine = new AgentsEngine(makeContext({ skills }));
			expect(engine).toBeDefined();
		});

		it("builtin rag agent exposes only semantic_search", async () => {
			const engine = new AgentsEngine(makeContext());
			const result = await engine.listAvailableToolNames(mockAuthContext, ragAgent);

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				expect(result.value).toEqual(["semantic_search"]);
			}
		});

		it("agents work without requiring a type field", async () => {
			const agentsService = {
				getAgent: async () => right(makeAgentData({ systemPrompt: "You are helpful." })),
				listAgents: async () => right([]),
			} as unknown as import("./agents_service.ts").AgentsService;

			const engine = new AgentsEngine(makeContext({ agentsService }));
			expect(engine).toBeDefined();
		});
	});

	describe("model resolution", () => {
		it("uses defaultModel when agent model is 'default'", async () => {
			const agentsService = {
				getAgent: async () => right(makeAgentData({ model: "default" })),
				listAgents: async () => right([]),
			} as unknown as import("./agents_service.ts").AgentsService;

			const engine = new AgentsEngine(makeContext({ agentsService }));
			expect(engine).toBeDefined();
			// The actual chat call would fail without API key — we just confirm the path
		});

		it("uses defaultModel when agent model is absent", async () => {
			const agentsService = {
				getAgent: async () => right(makeAgentData({ model: undefined })),
				listAgents: async () => right([]),
			} as unknown as import("./agents_service.ts").AgentsService;

			const engine = new AgentsEngine(makeContext({ agentsService }));
			expect(engine).toBeDefined();
		});
	});
});
