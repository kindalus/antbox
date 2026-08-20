import { describe, it } from "bdd";
import { expect } from "expect";
import {
	type Context,
	fauxAssistantMessage,
	fauxProvider,
	fauxToolCall,
	type SimpleStreamOptions,
} from "@earendil-works/pi-ai";
import type { AgentModelRuntime } from "./resolve_model.ts";
import { AgentsEngine, type AgentsEngineContext } from "./agents_engine.ts";
import { left, right } from "shared/either.ts";
import { type AntboxError, AntboxError as AntboxErrorClass } from "shared/antbox_error.ts";
import type { AgentData } from "domain/configuration/agent_data.ts";
import type { FeatureData } from "domain/configuration/feature_data.ts";
import type { AuthenticationContext } from "application/security/authentication_context.ts";
import { FeaturesEngine } from "application/features/features_engine.ts";
import { InMemoryEventBus } from "adapters/inmem/inmem_event_bus.ts";
import { customAgentRegistry } from "./custom_agents/index.ts";

const mockAuthContext: AuthenticationContext = {
	tenant: "test-tenant",
	principal: { email: "test@example.com", groups: [] },
	mode: "Direct",
};

function makeAgent(overrides: Partial<AgentData> = {}): AgentData {
	return {
		uuid: "test-agent",
		name: "Test Agent",
		description: "A test agent",
		exposedToUsers: true,
		model: "default",
		systemPrompt: "You are helpful.",
		createdTime: new Date().toISOString(),
		modifiedTime: new Date().toISOString(),
		...overrides,
	};
}

function makeContext(overrides: Partial<AgentsEngineContext> = {}): AgentsEngineContext {
	return {
		agentsService: {
			getAgent: async (_ctx: unknown, uuid: string) => {
				if (uuid === "missing") {
					return left(
						{ errorCode: "NotFound", message: "Agent not found" } as AntboxError,
					);
				}
				if (uuid === "internal-only") {
					return right(makeAgent({ uuid, exposedToUsers: false }));
				}
				return right(makeAgent({ uuid }));
			},
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

const testUsage = {
	input: 1,
	output: 1,
	cacheRead: 0,
	cacheWrite: 0,
	totalTokens: 2,
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function withUsage<T extends ReturnType<typeof fauxAssistantMessage>>(message: T): T {
	return { ...message, usage: testUsage };
}

function makeRuntime(
	responses: Parameters<ReturnType<typeof fauxProvider>["setResponses"]>[0],
): AgentModelRuntime {
	const faux = fauxProvider({ provider: "mock" });
	faux.setResponses(responses);
	return {
		streamFn: (model, context, options) => faux.provider.streamSimple(model, context, options),
		resolveModel: () => faux.getModel(),
		listModels: () => faux.models,
		getApiKey: () => Promise.resolve("test-key"),
		isConfigured: () => Promise.resolve(true),
	};
}

function makeTextRuntime(finalText: string): AgentModelRuntime {
	return makeRuntime([withUsage(fauxAssistantMessage(finalText))]);
}

function makeToolThenTextRuntime(finalText: string) {
	let calls = 0;
	const toolCounts: number[] = [];
	const contexts: Context[] = [];
	const optionsSeen: Array<SimpleStreamOptions | undefined> = [];
	const runtime = makeRuntime([
		(context, options) => {
			calls++;
			contexts.push(context);
			optionsSeen.push(options);
			toolCounts.push(context.tools?.length ?? 0);
			return withUsage(fauxAssistantMessage(
				fauxToolCall(
					"semantic_search",
					{ query: "pagamento de impostos este mês" },
					{ id: "call-1" },
				),
				{ stopReason: "toolUse" },
			));
		},
		(context, options) => {
			calls++;
			contexts.push(context);
			optionsSeen.push(options);
			toolCounts.push(context.tools?.length ?? 0);
			return withUsage(fauxAssistantMessage(finalText));
		},
	]);
	return {
		runtime,
		getCalls: () => calls,
		getToolCounts: () => [...toolCounts],
		getContexts: () => [...contexts],
		getOptions: () => [...optionsSeen],
	};
}

function makeSemanticSearchContext(
	modelRuntime: AgentModelRuntime,
	agentOverrides: Partial<AgentData> = {},
	contextOverrides: Partial<AgentsEngineContext> = {},
): AgentsEngineContext {
	return makeContext({
		agentsService: {
			getAgent: async (_ctx: unknown, uuid: string) =>
				right(makeAgent({ uuid, tools: ["semantic_search"], ...agentOverrides })),
		} as unknown as import("./agents_service.ts").AgentsService,
		nodeService: {
			find: async () => right({ nodes: [{ uuid: "tax-doc" }] }),
		} as unknown as import("application/nodes/node_service.ts").NodeService,
		ragService: {
			query: async () =>
				right([{
					uuid: "tax-doc",
					title: "tax-payment.pdf",
					content: "Pagamento ao Estado. Montante: 100 AOA.",
					score: 0.9,
				}]),
		} as unknown as import("./rag_service.ts").RAGService,
		modelRuntime,
		...contextOverrides,
	});
}

describe("AgentsEngine", () => {
	describe("guards", () => {
		it("returns NotFound from chat when agent does not exist", async () => {
			const engine = new AgentsEngine(makeContext());
			const result = await engine.chat(mockAuthContext, "missing", "hi");
			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) {
				expect(result.value.errorCode).toBe("NotFound");
			}
		});

		it("returns Forbidden when agent is not exposed to users", async () => {
			const engine = new AgentsEngine(makeContext());
			const result = await engine.chat(mockAuthContext, "internal-only", "hi");
			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) {
				expect(result.value.errorCode).toBe("Forbidden");
			}
		});

		it("returns Forbidden from answer when agent is not exposed to users", async () => {
			const engine = new AgentsEngine(makeContext());
			const result = await engine.answer(mockAuthContext, "internal-only", "hi");
			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) {
				expect(result.value.errorCode).toBe("Forbidden");
			}
		});

		it("rejects chat with malformed history (orphan tool call)", async () => {
			const engine = new AgentsEngine(makeContext());
			const result = await engine.chat(mockAuthContext, "test-agent", "hi", {
				history: [
					{
						role: "model",
						parts: [{
							toolCall: { id: "c1", name: "find_nodes", args: {} },
						}],
					},
				],
			});
			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) {
				expect(result.value.errorCode).toBe("InvalidChatHistory");
			}
		});

		it("converts Pi provider errors to an Antbox error", async () => {
			const runtime = makeRuntime([
				fauxAssistantMessage("", {
					stopReason: "error",
					errorMessage: "provider unavailable",
				}),
			]);
			const engine = new AgentsEngine(makeContext({ modelRuntime: runtime }));
			const result = await engine.answer(mockAuthContext, "test-agent", "hi");
			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) expect(result.value.errorCode).toBe("AgentAnswerError");
		});

		it("propagates tenant limit errors", async () => {
			const engine = new AgentsEngine(makeContext({
				tenantLimitsGuard: {
					ensureCanRunAgent: async () =>
						left(new AntboxErrorClass("LimitExceeded", "tokens exhausted")),
				} as unknown as import("application/metrics/tenant_limits_guard.ts").TenantLimitsEnforcer,
			}));
			const result = await engine.chat(mockAuthContext, "test-agent", "hi");
			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) {
				expect(result.value.errorCode).toBe("LimitExceeded");
			}
		});
	});

	describe("listAvailableToolNames", () => {
		it("returns the default tool when agent.tools is undefined", async () => {
			const engine = new AgentsEngine(makeContext());
			const result = await engine.listAvailableToolNames(
				mockAuthContext,
				makeAgent(),
			);
			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				expect(result.value).toEqual(["load_skill"]);
			}
		});

		it("returns all builtin tools when agent.tools is true", async () => {
			const engine = new AgentsEngine(makeContext());
			const result = await engine.listAvailableToolNames(
				mockAuthContext,
				makeAgent({ tools: true }),
			);
			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				expect(result.value).toEqual([
					"run_code",
					"find_nodes",
					"get_node",
					"semantic_search",
					"load_skill",
				]);
			}
		});

		it("returns whitelisted tools plus load_skill when agent.tools is array", async () => {
			const engine = new AgentsEngine(makeContext());
			const result = await engine.listAvailableToolNames(
				mockAuthContext,
				makeAgent({ tools: ["semantic_search"] }),
			);
			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				expect(result.value).toEqual(["semantic_search", "load_skill"]);
			}
		});

		it("returns only load_skill when agent.tools is empty array", async () => {
			const engine = new AgentsEngine(makeContext());
			const result = await engine.listAvailableToolNames(
				mockAuthContext,
				makeAgent({ tools: [] }),
			);
			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				expect(result.value).toEqual(["load_skill"]);
			}
		});
	});

	describe("openChatSession", () => {
		it("returns a sessionId and the tool snapshot", async () => {
			const engine = new AgentsEngine(makeContext());
			const result = await engine.openChatSession(mockAuthContext, "test-agent");
			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				expect(typeof result.value.sessionId).toBe("string");
				expect(result.value.toolNames).toEqual(["load_skill"]);
				expect(result.value.expiresAt).toBeGreaterThan(Date.now());
			}
		});

		it("rejects opening a session for an internal-only agent", async () => {
			const engine = new AgentsEngine(makeContext());
			const result = await engine.openChatSession(mockAuthContext, "internal-only");
			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) {
				expect(result.value.errorCode).toBe("Forbidden");
			}
		});

		it("rejects chat with an unknown sessionId", async () => {
			const engine = new AgentsEngine(makeContext());
			const result = await engine.chat(mockAuthContext, "test-agent", "hi", {
				sessionId: "does-not-exist",
			});
			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) {
				expect(result.value.errorCode).toBe("InvalidSession");
			}
		});

		it("rejects chat when sessionId tenant/agent does not match", async () => {
			const engine = new AgentsEngine(makeContext());
			const opened = await engine.openChatSession(mockAuthContext, "test-agent");
			if (opened.isLeft()) throw new Error("setup failed");
			const result = await engine.chat(mockAuthContext, "different-agent", "hi", {
				sessionId: opened.value.sessionId,
			});
			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) {
				expect(result.value.errorCode).toBe("InvalidSession");
			}
		});

		it("rejects chat when sessionId belongs to another user", async () => {
			const engine = new AgentsEngine(makeContext());
			const opened = await engine.openChatSession(mockAuthContext, "test-agent");
			if (opened.isLeft()) throw new Error("setup failed");
			const otherUser = {
				...mockAuthContext,
				principal: { email: "other@example.com", groups: [] },
			};
			const result = await engine.chat(otherUser, "test-agent", "hi", {
				sessionId: opened.value.sessionId,
			});
			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) expect(result.value.errorCode).toBe("InvalidSession");
		});

		it("rejects chat with stale tool name in history when using session", async () => {
			const engine = new AgentsEngine(makeContext());
			const opened = await engine.openChatSession(mockAuthContext, "test-agent");
			if (opened.isLeft()) throw new Error("setup failed");
			const result = await engine.chat(mockAuthContext, "test-agent", "hi", {
				sessionId: opened.value.sessionId,
				history: [
					{
						role: "model",
						parts: [{ toolCall: { id: "c1", name: "vanished_tool", args: {} } }],
					},
					{
						role: "tool",
						parts: [{ toolResponse: { id: "c1", name: "vanished_tool", text: "{}" } }],
					},
				],
			});
			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) {
				expect(result.value.errorCode).toBe("StaleHistoryTool");
			}
		});

		it("closeChatSession invalidates the session", async () => {
			const engine = new AgentsEngine(makeContext());
			const opened = await engine.openChatSession(mockAuthContext, "test-agent");
			if (opened.isLeft()) throw new Error("setup failed");
			expect(engine.closeChatSession(opened.value.sessionId)).toBe(true);
			const result = await engine.chat(mockAuthContext, "test-agent", "hi", {
				sessionId: opened.value.sessionId,
			});
			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) {
				expect(result.value.errorCode).toBe("InvalidSession");
			}
		});
	});

	describe("tool finalization", () => {
		it("chat continues after a tool response and ends with a model answer", async () => {
			const mockModel = makeToolThenTextRuntime("Foram encontrados pagamentos de impostos.");
			const engine = new AgentsEngine(makeSemanticSearchContext(mockModel.runtime));

			const result = await engine.chat(
				mockAuthContext,
				"test-agent",
				"pagamento de impostos este mês",
			);

			expect(result.isRight()).toBe(true);
			if (result.isLeft()) throw result.value;

			expect(result.value.map((message) => message.role)).toEqual([
				"user",
				"model",
				"tool",
				"model",
			]);
			expect(result.value.at(-1)?.parts[0].text).toBe(
				"Foram encontrados pagamentos de impostos.",
			);
			expect(result.value.at(-1)?.role).toBe("model");
			expect(mockModel.getCalls()).toBe(2);
			expect(mockModel.getToolCounts()).toEqual([2, 2]);
		});

		it("executes a feature-backed AI tool through the complete Pi loop", async () => {
			const feature: FeatureData = {
				uuid: "calculateTotal",
				title: "Calculate total",
				description: "Double an item count",
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
				groupsAllowed: [],
				parameters: [{ name: "itemCount", type: "number", required: true }],
				returnType: "object",
				run: "async function(_ctx, args) { return { total: args.itemCount * 2 }; }",
				createdTime: "2026-01-01T00:00:00.000Z",
				modifiedTime: "2026-01-01T00:00:00.000Z",
			};
			let requestedFeatureUuid: string | undefined;
			const featuresService = {
				listAITools: () => Promise.resolve(right([feature])),
				getFeature: (_ctx: AuthenticationContext, uuid: string) => {
					requestedFeatureUuid = uuid;
					return Promise.resolve(right(feature));
				},
			} as unknown as import("application/features/features_service.ts").FeaturesService;
			const modelRuntime = makeRuntime([
				(context) => {
					expect(context.tools?.map((tool) => tool.name)).toContain("calculate_total");
					return withUsage(fauxAssistantMessage(
						fauxToolCall("calculate_total", { item_count: 4 }, { id: "feature-call" }),
						{ stopReason: "toolUse" },
					));
				},
				(context) => {
					const toolResult = context.messages.find((message) => message.role === "toolResult");
					expect(toolResult?.toolName).toBe("calculate_total");
					expect(toolResult?.content).toEqual([{ type: "text", text: '{"total":8}' }]);
					return withUsage(fauxAssistantMessage("The total is 8."));
				},
			]);
			const engine = new AgentsEngine(makeContext({
				agentsService: {
					getAgent: () => Promise.resolve(right(makeAgent({ tools: ["calculateTotal"] }))),
				} as unknown as import("./agents_service.ts").AgentsService,
				featuresService,
				modelRuntime,
			}));
			const featuresEngine = new FeaturesEngine({
				featuresService,
				nodeService: {} as import("application/nodes/node_service.ts").NodeService,
				eventBus: new InMemoryEventBus(),
			});
			engine.setFeatureAIToolExecutor(featuresEngine);

			const result = await engine.chat(mockAuthContext, "test-agent", "Double four");

			expect(result.isRight()).toBe(true);
			if (result.isLeft()) throw result.value;
			expect(result.value.map((message) => message.role)).toEqual([
				"user",
				"model",
				"tool",
				"model",
			]);
			expect(result.value.at(-1)?.parts).toEqual([{ text: "The total is 8." }]);
			expect(requestedFeatureUuid).toBe("calculateTotal");
		});

		it("agent instruction ends with today's ISO date and weekday", async () => {
			const mockModel = makeToolThenTextRuntime("Resposta baseada na data atual.");
			const engine = new AgentsEngine(
				makeSemanticSearchContext(mockModel.runtime, { systemPrompt: "Custom prompt." }, {
					now: () => new Date(2026, 4, 2, 12),
				}),
			);

			const result = await engine.chat(mockAuthContext, "test-agent", "este mês");

			expect(result.isRight()).toBe(true);
			if (result.isLeft()) throw result.value;

			const firstPrompt = mockModel.getContexts()[0].systemPrompt;
			expect(firstPrompt).toContain("Custom prompt.\n\nToday's date: 2026-05-02 (Saturday).");
		});

		it("forwards temperature and maxTokens to Pi", async () => {
			const mockModel = makeToolThenTextRuntime("Configured response.");
			const engine = new AgentsEngine(makeSemanticSearchContext(mockModel.runtime));
			const result = await engine.answer(mockAuthContext, "test-agent", "query", {
				temperature: 0.25,
				maxTokens: 321,
			});
			expect(result.isRight()).toBe(true);
			expect(mockModel.getOptions()[0]?.temperature).toBe(0.25);
			expect(mockModel.getOptions()[0]?.maxTokens).toBe(321);
		});

		it("chat appends a final model answer when maxLlmCalls stops after a tool response", async () => {
			const mockModel = makeToolThenTextRuntime("Resposta final sintetizada dos resultados.");
			const engine = new AgentsEngine(
				makeSemanticSearchContext(mockModel.runtime, { maxLlmCalls: 1 }),
			);

			const result = await engine.chat(
				mockAuthContext,
				"test-agent",
				"pagamento de impostos este mês",
			);

			expect(result.isRight()).toBe(true);
			if (result.isLeft()) throw result.value;

			expect(result.value.map((message) => message.role)).toEqual([
				"user",
				"model",
				"tool",
				"model",
			]);
			expect(result.value.at(-1)?.parts[0].text).toBe(
				"Resposta final sintetizada dos resultados.",
			);
			expect(mockModel.getCalls()).toBe(2);
			expect(mockModel.getToolCounts()).toEqual([2, 0]);
		});

		it("chat guards custom agents from ending with a tool response", async () => {
			const uuid = "custom-tool-agent";
			customAgentRegistry.set(uuid, {
				data: makeAgent({ uuid }),
				create: () =>
					({
						run: async () => ({
							text: "Custom final answer",
							messages: [
								{
									role: "model",
									parts: [{ toolCall: { id: "c1", name: "custom_tool", args: {} } }],
								},
								{
									role: "tool",
									parts: [{ toolResponse: { id: "c1", name: "custom_tool", text: "{}" } }],
								},
							],
						}),
					}) as unknown as import("./custom_agents/base_antbox_agent.ts").BaseAntboxAgent,
			});

			try {
				const engine = new AgentsEngine(makeContext());
				const result = await engine.chat(mockAuthContext, uuid, "hi");

				expect(result.isRight()).toBe(true);
				if (result.isLeft()) throw result.value;

				expect(result.value.map((message) => message.role)).toEqual([
					"user",
					"model",
					"tool",
					"model",
				]);
				expect(result.value.at(-1)?.parts).toEqual([{ text: "Custom final answer" }]);
			} finally {
				customAgentRegistry.delete(uuid);
			}
		});

		it("answer returns synthesized text after a tool response", async () => {
			const mockModel = makeToolThenTextRuntime("Resposta direta baseada na pesquisa.");
			const engine = new AgentsEngine(
				makeSemanticSearchContext(mockModel.runtime, { maxLlmCalls: 1 }),
			);

			const result = await engine.answer(
				mockAuthContext,
				"test-agent",
				"pagamento de impostos este mês",
			);

			expect(result.isRight()).toBe(true);
			if (result.isLeft()) throw result.value;

			expect(result.value.role).toBe("model");
			expect(result.value.parts).toEqual([{ text: "Resposta direta baseada na pesquisa." }]);
			expect(mockModel.getToolCounts()).toEqual([2, 0]);
		});
	});

	describe("usage events", () => {
		it("publishes one completed event with Pi token usage", async () => {
			const events: unknown[] = [];
			const engine = new AgentsEngine(makeContext({
				modelRuntime: makeTextRuntime("Usage response"),
				eventBus: {
					publish: (event) => events.push(event),
					subscribe: () => {},
					unsubscribe: () => {},
				},
			}));
			const result = await engine.answer(mockAuthContext, "test-agent", "hi");
			expect(result.isRight()).toBe(true);
			expect(events.length).toBe(1);
			const event = events[0] as { payload?: { usage?: { totalTokens?: number } } };
			expect(event.payload?.usage?.totalTokens).toBeGreaterThan(0);
		});
	});

	describe("runInternal*", () => {
		it("runInternalChat does NOT enforce exposedToUsers", async () => {
			const engine = new AgentsEngine(makeContext({
				modelRuntime: makeTextRuntime("Internal chat response"),
			}));

			const result = await engine.runInternalChat(mockAuthContext, "internal-only", "hi");

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				expect(result.value.map((message) => message.role)).toEqual(["user", "model"]);
				expect(result.value.at(-1)?.parts).toEqual([{ text: "Internal chat response" }]);
			}
		});

		it("runInternalAnswer does NOT enforce exposedToUsers", async () => {
			const engine = new AgentsEngine(makeContext({
				modelRuntime: makeTextRuntime("Internal answer response"),
			}));

			const result = await engine.runInternalAnswer(mockAuthContext, "internal-only", "hi");

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				expect(result.value.role).toBe("model");
				expect(result.value.parts).toEqual([{ text: "Internal answer response" }]);
				expect(result.value.usage?.totalTokens).toBeGreaterThan(0);
			}
		});

		it("runInternalChat still enforces NotFound for unknown agents", async () => {
			const engine = new AgentsEngine(makeContext());
			const result = await engine.runInternalChat(mockAuthContext, "missing", "hi");
			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) {
				expect(result.value.errorCode).toBe("NotFound");
			}
		});
	});
});
