import { describe, it } from "bdd";
import { expect } from "expect";
import type { LanguageModel } from "ai";
import { AgentsEngine, type AgentsEngineContext } from "./agents_engine.ts";
import { left, right } from "shared/either.ts";
import { type AntboxError, AntboxError as AntboxErrorClass } from "shared/antbox_error.ts";
import type { AgentData } from "domain/configuration/agent_data.ts";
import type { AuthenticationContext } from "application/security/authentication_context.ts";
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

function makeLanguageModelResponse(content: unknown[]) {
	return {
		content,
		finishReason: content.some((part) => (part as { type?: string }).type === "tool-call")
			? "tool-calls"
			: "stop",
		usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
		warnings: [],
	};
}

function makeToolThenTextModel(finalText: string) {
	let calls = 0;
	const toolCounts: Array<number | undefined> = [];
	const prompts: unknown[] = [];
	const model = {
		specificationVersion: "v2" as const,
		provider: "mock",
		modelId: "mock",
		supportedUrls: {},
		doGenerate: async (options: { prompt?: unknown; tools?: unknown[] }) => {
			calls++;
			prompts.push(options.prompt);
			toolCounts.push(options.tools?.length);
			if (calls === 1) {
				return makeLanguageModelResponse([{
					type: "tool-call",
					toolCallId: "call-1",
					toolName: "semantic_search",
					input: JSON.stringify({ query: "pagamento de impostos este mês" }),
				}]);
			}
			return makeLanguageModelResponse([{ type: "text", text: finalText }]);
		},
		doStream: async () => {
			throw new Error("streaming is not used by these tests");
		},
	} as unknown as LanguageModel;

	return {
		model,
		getCalls: () => calls,
		getToolCounts: () => [...toolCounts],
		getPrompts: () => [...prompts],
	};
}

function makeSemanticSearchContext(
	model: LanguageModel,
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
		resolveLanguageModel: () => model,
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
			const mockModel = makeToolThenTextModel("Foram encontrados pagamentos de impostos.");
			const engine = new AgentsEngine(makeSemanticSearchContext(mockModel.model));

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

		it("agent instruction ends with today's ISO date and weekday", async () => {
			const mockModel = makeToolThenTextModel("Resposta baseada na data atual.");
			const engine = new AgentsEngine(
				makeSemanticSearchContext(mockModel.model, { systemPrompt: "Custom prompt." }, {
					now: () => new Date(2026, 4, 2, 12),
				}),
			);

			const result = await engine.chat(mockAuthContext, "test-agent", "este mês");

			expect(result.isRight()).toBe(true);
			if (result.isLeft()) throw result.value;

			const firstPrompt = JSON.stringify(mockModel.getPrompts()[0]);
			expect(firstPrompt).toContain("Custom prompt.\\n\\nToday's date: 2026-05-02 (Saturday).");
		});

		it("chat appends a final model answer when maxLlmCalls stops after a tool response", async () => {
			const mockModel = makeToolThenTextModel("Resposta final sintetizada dos resultados.");
			const engine = new AgentsEngine(
				makeSemanticSearchContext(mockModel.model, { maxLlmCalls: 1 }),
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
			expect(mockModel.getToolCounts()).toEqual([2, undefined]);
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
			const mockModel = makeToolThenTextModel("Resposta direta baseada na pesquisa.");
			const engine = new AgentsEngine(
				makeSemanticSearchContext(mockModel.model, { maxLlmCalls: 1 }),
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
			expect(mockModel.getToolCounts()).toEqual([2, undefined]);
		});
	});

	describe("runInternal*", () => {
		it("runInternalChat does NOT enforce exposedToUsers", async () => {
			const engine = new AgentsEngine(makeContext());
			// Resolves the agent then attempts to invoke generateText, which will fail
			// with a different error class (model resolution/network). The point is
			// that we get past the Forbidden gate.
			const result = await engine.runInternalChat(mockAuthContext, "internal-only", "hi");
			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) {
				expect(result.value.errorCode).not.toBe("Forbidden");
			}
		});

		it("runInternalAnswer does NOT enforce exposedToUsers", async () => {
			const engine = new AgentsEngine(makeContext());
			const result = await engine.runInternalAnswer(mockAuthContext, "internal-only", "hi");
			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) {
				expect(result.value.errorCode).not.toBe("Forbidden");
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
