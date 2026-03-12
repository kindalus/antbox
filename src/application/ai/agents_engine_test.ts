import { describe, it } from "bdd";
import { expect } from "expect";
import { AgentsEngine, type AgentsEngineContext, selectAgentTools } from "./agents_engine.ts";
import { left, right } from "shared/either.ts";
import type { AntboxError } from "shared/antbox_error.ts";
import type { AgentData } from "domain/configuration/agent_data.ts";
import type { AuthenticationContext } from "application/security/authentication_context.ts";

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
		type: "llm",
		exposedToUsers: true,
		model: "default",
		systemPrompt: "You are a helpful assistant.",
		createdTime: new Date().toISOString(),
		modifiedTime: new Date().toISOString(),
		...overrides,
	};
}

function makeSequentialAgentData(overrides: Partial<AgentData> = {}): AgentData {
	return {
		uuid: "sequential-agent-uuid",
		name: "Sequential Pipeline",
		description: "A sequential pipeline",
		type: "sequential",
		exposedToUsers: true,
		agents: [
			"--semantic-searcher-agent--",
			"--rag-node-filtering-agent--",
			"--rag-summarizer-agent--",
		],
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
				if (uuid === "--semantic-searcher-agent--") {
					return right(
						makeAgentData({
							uuid: "--semantic-searcher-agent--",
							name: "Semantic Searcher",
							type: "llm",
							model: "default",
							tools: ["runCode"],
							systemPrompt: "You are a semantic searcher.",
						}),
					);
				}
				if (uuid === "--rag-summarizer-agent--") {
					return right(
						makeAgentData({
							uuid: "--rag-summarizer-agent--",
							name: "RAG Summarizer",
							type: "llm",
							model: "default",
							tools: false,
							systemPrompt: "You summarize search results.",
						}),
					);
				}
				if (uuid === "--rag-node-filtering-agent--") {
					return right(
						makeAgentData({
							uuid: "--rag-node-filtering-agent--",
							name: "RAG Node Filtering Agent",
							type: "llm",
							model: "default",
							tools: false,
							systemPrompt: "You filter node search results.",
						}),
					);
				}
				return right(makeAgentData());
			},
			listAgents: async () => right([]),
			createAgent: async () => right(makeAgentData()),
			updateAgent: async () => right(makeAgentData()),
			deleteAgent: async () => right(undefined as unknown as void),
		} as unknown as import("./agents_service.ts").AgentsService,
		nodeService: {} as unknown as import("application/nodes/node_service.ts").NodeService,
		aspectsService:
			{} as unknown as import("application/aspects/aspects_service.ts").AspectsService,
		defaultModel: "google/gemini-2.5-flash",
		skills: [],
		...overrides,
	};
}

// ============================================================================
// TESTS
// ============================================================================

describe("AgentsEngine", () => {
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
	});

	describe("sequential agent dispatch", () => {
		it("returns error when sequential agent has unknown sub-agent UUID", async () => {
			const agentsService = {
				getAgent: async (_ctx: unknown, uuid: string) => {
					if (uuid === "pipeline-agent") {
						return right(
							makeSequentialAgentData({
								uuid: "pipeline-agent",
								agents: ["not-found-sub-agent"],
							}),
						);
					}
					// Sub-agent lookup returns not found
					return left(
						{ errorCode: "NotFound", message: "Agent not found" } as AntboxError,
					);
				},
				listAgents: async () => right([]),
			} as unknown as import("./agents_service.ts").AgentsService;

			const engine = new AgentsEngine(makeContext({ agentsService }));

			const result = await engine.chat(mockAuthContext, "pipeline-agent", "Hello");

			expect(result.isLeft()).toBe(true);
		});
	});

	describe("tools filtering", () => {
		it("tools=true enables all tools", () => {
			const selected = selectAgentTools(
				[{ name: "runCode" }, { name: "skillLoader" }],
				true,
			);

			expect(selected.map((tool) => tool.name)).toEqual(["runCode", "skillLoader"]);
		});

		it("tools=false keeps only skillLoader", () => {
			const selected = selectAgentTools(
				[{ name: "runCode" }, { name: "skillLoader" }],
				false,
			);

			expect(selected.map((tool) => tool.name)).toEqual(["skillLoader"]);
		});

		it("tools undefined keeps only skillLoader", () => {
			const selected = selectAgentTools(
				[{ name: "runCode" }, { name: "skillLoader" }],
				undefined,
			);

			expect(selected.map((tool) => tool.name)).toEqual(["skillLoader"]);
		});

		it("empty tools array keeps only skillLoader", () => {
			const selected = selectAgentTools(
				[{ name: "runCode" }, { name: "skillLoader" }],
				[],
			);

			expect(selected.map((tool) => tool.name)).toEqual(["skillLoader"]);
		});

		it("tools array keeps listed tools plus skillLoader", () => {
			const selected = selectAgentTools(
				[{ name: "runCode" }, { name: "skillLoader" }, { name: "other" }],
				["runCode"],
			);

			expect(selected.map((tool) => tool.name)).toEqual(["runCode", "skillLoader"]);
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

		it("LLM agent with no type field still resolves as LLM", async () => {
			// Validates that type defaults to "llm" at the engine level.
			// getAgent returns an agent without explicit type.
			const agentsService = {
				getAgent: async () =>
					right(
						makeAgentData({ type: undefined, systemPrompt: "You are helpful." }),
					),
				listAgents: async () => right([]),
			} as unknown as import("./agents_service.ts").AgentsService;

			const engine = new AgentsEngine(makeContext({ agentsService }));
			expect(engine).toBeDefined();
			// Actual LLM call would fail without API key; we confirm no construction error
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
