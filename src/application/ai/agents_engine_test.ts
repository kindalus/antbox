import { describe, it } from "bdd";
import { expect } from "expect";
import { AgentsEngine, type AgentsEngineContext } from "./agents_engine.ts";
import { left, right } from "shared/either.ts";
import { type AntboxError, AntboxError as AntboxErrorClass } from "shared/antbox_error.ts";
import type { AgentData } from "domain/configuration/agent_data.ts";
import type { AuthenticationContext } from "application/security/authentication_context.ts";

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
				} as unknown as import("application/metrics/tenant_limits_guard.ts")
					.TenantLimitsEnforcer,
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
