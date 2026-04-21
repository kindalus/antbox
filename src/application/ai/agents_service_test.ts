import { describe, it } from "bdd";
import { expect } from "expect";
import type { AuthenticationContext } from "application/security/authentication_context.ts";
import { InMemoryConfigurationRepository } from "adapters/inmem/inmem_configuration_repository.ts";
import { AgentsService, DEFAULT_AGENT_SYSTEM_PROMPT } from "application/ai/agents_service.ts";
import { ADMINS_GROUP_UUID } from "domain/configuration/builtin_groups.ts";
import type { AgentData } from "domain/configuration/agent_data.ts";
import {
	ASPECT_FIELD_EXTRACTOR_AGENT_UUID,
	CODE_WRITER_AGENT_UUID,
	RAG_AGENT_UUID,
} from "domain/configuration/builtin_agents.ts";

function createAgentsService(repo: InMemoryConfigurationRepository) {
	return new AgentsService({
		configRepo: repo,
	});
}

describe("AgentsService", () => {
	const adminCtx: AuthenticationContext = {
		tenant: "test",
		principal: {
			email: "admin@example.com",
			groups: [ADMINS_GROUP_UUID],
		},
		mode: "Action",
	};

	const userCtx: AuthenticationContext = {
		tenant: "test",
		principal: {
			email: "user@example.com",
			groups: ["--users--"],
		},
		mode: "Action",
	};

	describe("createAgent — LLM agents", () => {
		it("should create LLM agent successfully as admin", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = createAgentsService(repo);

			const result = await service.createAgent(adminCtx, {
				name: "Customer Support Agent",
				description: "Handles customer inquiries",
				systemPrompt: "You are a helpful customer support agent.",
			});

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				const agent = result.value;
				expect(agent.uuid).toBeDefined();
				expect(agent.name).toBe("Customer Support Agent");
				expect(agent.description).toBe("Handles customer inquiries");
				expect(agent.exposedToUsers).toBe(true);
				expect(agent.systemPrompt).toBe("You are a helpful customer support agent.");
				expect(agent.createdTime).toBeDefined();
				expect(agent.modifiedTime).toBeDefined();
			}
		});

		it("creates agents without requiring a type field", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = createAgentsService(repo);

			const result = await service.createAgent(adminCtx, {
				name: "Implicit LLM Agent",
				systemPrompt: "You are a helpful assistant.",
			});

			expect(result.isRight()).toBe(true);
		});

		it("uses a caller-provided uuid when creating an agent", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = createAgentsService(repo);

			const result = await service.createAgent(adminCtx, {
				uuid: "support-agent",
				name: "Support Agent",
				systemPrompt: "You are helpful.",
			} as never);

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				expect(result.value.uuid).toBe("support-agent");
			}
		});

		it("createOrReplaceAgent reports whether the upload created a new agent", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = createAgentsService(repo);

			const result = await service.createOrReplaceAgent(adminCtx, {
				uuid: "upsert-agent",
				name: "Upsert Agent",
				systemPrompt: "You are helpful.",
			} as never);

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				expect(result.value.created).toBe(true);
				expect(result.value.agent.uuid).toBe("upsert-agent");
			}
		});

		it("should create LLM agent with tools whitelist", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = createAgentsService(repo);

			const result = await service.createAgent(adminCtx, {
				name: "Code Agent",
				systemPrompt: "You run code to answer questions.",
				tools: ["run_code"],
			});

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				expect(result.value.tools).toEqual(["run_code"]);
			}
		});

		it("should create LLM agent with tools=true", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = createAgentsService(repo);

			const result = await service.createAgent(adminCtx, {
				name: "All Tools Agent",
				systemPrompt: "You may use all tools.",
				tools: true,
			});

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				expect(result.value.tools).toBe(true);
			}
		});

		it("should create LLM agent with empty tools (no tools)", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = createAgentsService(repo);

			const result = await service.createAgent(adminCtx, {
				name: "No Tools Agent",
				systemPrompt: "You answer from memory only.",
				tools: [],
			});

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				expect(result.value.tools).toEqual([]);
			}
		});

		it("should create LLM agent with tools=false", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = createAgentsService(repo);

			const result = await service.createAgent(adminCtx, {
				name: "Skill Loader Only Agent",
				systemPrompt: "You may use only load_skill.",
				tools: false,
			});

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				expect(result.value.tools).toBe(false);
			}
		});

		it("should allow creating hidden agents", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = createAgentsService(repo);

			const result = await service.createAgent(adminCtx, {
				name: "Internal Search Agent",
				systemPrompt: "You are internal only.",
				exposedToUsers: false,
			});

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				expect(result.value.exposedToUsers).toBe(false);
			}
		});

		it("defaults systemPrompt when creating an agent without one", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = createAgentsService(repo);

			const result = await service.createAgent(adminCtx, {
				name: "Default Prompt Agent",
			} as never);

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				expect(result.value.systemPrompt).toBe(DEFAULT_AGENT_SYSTEM_PROMPT);
			}
		});

		it("replaces an existing custom agent when the same uuid is uploaded", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = createAgentsService(repo);
			const createdTime = "2024-01-01T00:00:00.000Z";

			await repo.save("agents", {
				uuid: "replaceable-agent",
				name: "Original Agent",
				description: "Original description",
				exposedToUsers: false,
				model: "default",
				tools: ["run_code"],
				systemPrompt: "Original instructions",
				createdTime,
				modifiedTime: createdTime,
			} as AgentData);

			const result = await service.createAgent(adminCtx, {
				uuid: "replaceable-agent",
				name: "Replacement Agent",
				systemPrompt: "Replacement instructions",
			} as never);

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				expect(result.value.uuid).toBe("replaceable-agent");
				expect(result.value.name).toBe("Replacement Agent");
				expect(result.value.description).toBeUndefined();
				expect(result.value.exposedToUsers).toBe(true);
				expect(result.value.tools).toBeUndefined();
				expect(result.value.createdTime).toBe(createdTime);
				expect(result.value.modifiedTime).not.toBe(createdTime);
			}
		});

		it("rejects uploads that target system agent uuids", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = createAgentsService(repo);

			const result = await service.createAgent(adminCtx, {
				uuid: RAG_AGENT_UUID,
				name: "Fake RAG",
				systemPrompt: "Nope",
			} as never);

			expect(result.isLeft()).toBe(true);
		});

		it("should reject creation as non-admin", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = createAgentsService(repo);

			const result = await service.createAgent(userCtx, {
				name: "Test Agent",
				systemPrompt: "Test instructions",
			});

			expect(result.isLeft()).toBe(true);
		});

		it("should validate required name field", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = createAgentsService(repo);

			const result = await service.createAgent(adminCtx, {
				name: "",
				systemPrompt: "Test instructions",
			});

			expect(result.isLeft()).toBe(true);
		});
	});

	describe("getAgent", () => {
		it("should get agent successfully", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = createAgentsService(repo);

			const createResult = await service.createAgent(adminCtx, {
				name: "Test Agent",
				description: "Test description",
				systemPrompt: "Test instructions",
			});

			expect(createResult.isRight()).toBe(true);
			if (!createResult.isRight()) return;

			const result = await service.getAgent(adminCtx, createResult.value.uuid);

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				expect(result.value.uuid).toBe(createResult.value.uuid);
			}
		});

		it("should default exposedToUsers to true for legacy custom agents", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = createAgentsService(repo);

			await repo.save("agents", {
				uuid: "legacy-agent",
				name: "Legacy Agent",
				systemPrompt: "Legacy instructions",
				createdTime: new Date().toISOString(),
				modifiedTime: new Date().toISOString(),
			} as unknown as AgentData);

			const result = await service.getAgent(adminCtx, "legacy-agent");

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				expect(result.value.exposedToUsers).toBe(true);
			}
		});

		it("defaults systemPrompt for legacy agents missing one", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = createAgentsService(repo);

			await repo.save("agents", {
				uuid: "legacy-no-prompt-agent",
				name: "Legacy No Prompt Agent",
				createdTime: new Date().toISOString(),
				modifiedTime: new Date().toISOString(),
			} as unknown as AgentData);

			const result = await service.getAgent(adminCtx, "legacy-no-prompt-agent");

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				expect(result.value.systemPrompt).toBe(DEFAULT_AGENT_SYSTEM_PROMPT);
			}
		});

		it("should get builtin RAG agent", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = createAgentsService(repo);

			const result = await service.getAgent(adminCtx, RAG_AGENT_UUID);

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				expect(result.value.uuid).toBe(RAG_AGENT_UUID);
				expect(result.value.name).toBe("RAG Agent");
				expect(result.value.exposedToUsers).toBe(true);
			}
		});

		it("should prefer builtin RAG agent over repository agents with the same UUID", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = createAgentsService(repo);

			await repo.save("agents", {
				uuid: RAG_AGENT_UUID,
				name: "Repository RAG Agent",
				exposedToUsers: false,
				systemPrompt: "Repository instructions",
				createdTime: new Date().toISOString(),
				modifiedTime: new Date().toISOString(),
			} as AgentData);

			const result = await service.getAgent(adminCtx, RAG_AGENT_UUID);

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				expect(result.value.uuid).toBe(RAG_AGENT_UUID);
				expect(result.value.name).toBe("RAG Agent");
				expect(result.value.exposedToUsers).toBe(true);
			}
		});

		it("should get builtin aspect field extractor agent", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = createAgentsService(repo);

			const result = await service.getAgent(adminCtx, ASPECT_FIELD_EXTRACTOR_AGENT_UUID);

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				expect(result.value.uuid).toBe(ASPECT_FIELD_EXTRACTOR_AGENT_UUID);
				expect(result.value.name).toBe("Aspect Field Extractor");
				expect(result.value.exposedToUsers).toBe(false);
			}
		});

		it("should allow non-admin to get agent", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = createAgentsService(repo);

			const createResult = await service.createAgent(adminCtx, {
				name: "Public Agent",
				description: "Accessible to all",
				systemPrompt: "Public instructions",
			});

			expect(createResult.isRight()).toBe(true);
			if (!createResult.isRight()) return;

			const result = await service.getAgent(userCtx, createResult.value.uuid);

			expect(result.isRight()).toBe(true);
		});
	});

	describe("listAgents", () => {
		it("should include all 3 system agents plus repository agents", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = createAgentsService(repo);

			// Create two custom agents
			await service.createAgent(adminCtx, {
				name: "Agent A",
				systemPrompt: "Instructions A",
			});

			await service.createAgent(adminCtx, {
				name: "Agent B",
				systemPrompt: "Instructions B",
			});

			const result = await service.listAgents(adminCtx);

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				// Should include 2 repository agents + 3 system agents
				expect(result.value.length).toBe(5);
			}
		});

		it("should include the 3 system agents when no repository agents", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = createAgentsService(repo);

			const result = await service.listAgents(adminCtx);

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				expect(result.value.length).toBe(3);
				const uuids = result.value.map((a) => a.uuid);
				expect(uuids).toContain(RAG_AGENT_UUID);
				expect(uuids).toContain(ASPECT_FIELD_EXTRACTOR_AGENT_UUID);
				expect(uuids).toContain(CODE_WRITER_AGENT_UUID);
			}
		});

		it("should allow non-admin to list agents", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = createAgentsService(repo);

			await service.createAgent(adminCtx, {
				name: "Test Agent",
				systemPrompt: "Test instructions",
			});

			const result = await service.listAgents(userCtx);

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				expect(result.value.length).toBeGreaterThan(0);
			}
		});

		it("should include hidden agents in list results", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = createAgentsService(repo);

			const created = await service.createAgent(adminCtx, {
				name: "Internal Agent",
				systemPrompt: "Internal only",
				exposedToUsers: false,
			});
			expect(created.isRight()).toBe(true);
			if (!created.isRight()) return;

			const result = await service.listAgents(userCtx);
			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				const uuids = result.value.map((agent) => agent.uuid);
				expect(uuids).toContain(created.value.uuid);
			}
		});

		it("should default exposedToUsers to true for legacy agents in list results", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = createAgentsService(repo);

			await repo.save("agents", {
				uuid: "legacy-list-agent",
				name: "Legacy List Agent",
				systemPrompt: "Legacy instructions",
				createdTime: new Date().toISOString(),
				modifiedTime: new Date().toISOString(),
			} as unknown as AgentData);

			const result = await service.listAgents(userCtx);
			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				const legacyAgent = result.value.find((agent) => agent.uuid === "legacy-list-agent");
				expect(legacyAgent?.exposedToUsers).toBe(true);
			}
		});

		it("defaults systemPrompt in list results for legacy agents missing one", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = createAgentsService(repo);

			await repo.save("agents", {
				uuid: "legacy-list-no-prompt-agent",
				name: "Legacy List No Prompt Agent",
				createdTime: new Date().toISOString(),
				modifiedTime: new Date().toISOString(),
			} as unknown as AgentData);

			const result = await service.listAgents(userCtx);
			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				const legacyAgent = result.value.find((agent) =>
					agent.uuid === "legacy-list-no-prompt-agent"
				);
				expect(legacyAgent?.systemPrompt).toBe(DEFAULT_AGENT_SYSTEM_PROMPT);
			}
		});
	});

	describe("updateAgent", () => {
		it("should update agent name and systemPrompt successfully as admin", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = createAgentsService(repo);

			const createResult = await service.createAgent(adminCtx, {
				name: "Original Name",
				description: "Original description",
				systemPrompt: "Original instructions",
			});

			expect(createResult.isRight()).toBe(true);
			if (!createResult.isRight()) return;

			const result = await service.updateAgent(adminCtx, createResult.value.uuid, {
				name: "Updated Name",
				systemPrompt: "Updated instructions",
			});

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				expect(result.value.name).toBe("Updated Name");
				expect(result.value.systemPrompt).toBe("Updated instructions");
				expect(result.value.description).toBe("Original description");
				expect(result.value.createdTime).toBe(createResult.value.createdTime);
				expect(result.value.modifiedTime).toBeDefined();
			}
		});

		it("should reject update as non-admin", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = createAgentsService(repo);

			const createResult = await service.createAgent(adminCtx, {
				name: "Test Agent",
				systemPrompt: "Test instructions",
			});

			expect(createResult.isRight()).toBe(true);
			if (!createResult.isRight()) return;

			const result = await service.updateAgent(userCtx, createResult.value.uuid, {
				name: "Hacked Name",
			});

			expect(result.isLeft()).toBe(true);
		});

		it("should reject update of builtin agent", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = createAgentsService(repo);

			const result = await service.updateAgent(adminCtx, RAG_AGENT_UUID, {
				name: "Modified RAG Agent",
			});

			expect(result.isLeft()).toBe(true);
		});

		it("should default exposedToUsers to true when updating a legacy agent", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = createAgentsService(repo);
			const uuid = "--legacy-update-agent--";

			await repo.save("agents", {
				uuid,
				name: "Legacy Update Agent",
				systemPrompt: "Legacy instructions",
				createdTime: new Date().toISOString(),
				modifiedTime: new Date().toISOString(),
			} as unknown as AgentData);

			const result = await service.updateAgent(adminCtx, uuid, {
				name: "Updated Legacy Agent",
			});

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				expect(result.value.name).toBe("Updated Legacy Agent");
				expect(result.value.exposedToUsers).toBe(true);
			}
		});
	});

	describe("deleteAgent", () => {
		it("should delete agent successfully as admin", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = createAgentsService(repo);

			const createResult = await service.createAgent(adminCtx, {
				name: "To Delete",
				systemPrompt: "Test instructions",
			});

			expect(createResult.isRight()).toBe(true);
			if (!createResult.isRight()) return;

			const result = await service.deleteAgent(adminCtx, createResult.value.uuid);

			expect(result.isRight()).toBe(true);

			// Verify it's gone
			const getResult = await service.getAgent(adminCtx, createResult.value.uuid);
			expect(getResult.isLeft()).toBe(true);
		});

		it("should reject delete as non-admin", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = createAgentsService(repo);

			const createResult = await service.createAgent(adminCtx, {
				name: "Protected Agent",
				systemPrompt: "Test instructions",
			});

			expect(createResult.isRight()).toBe(true);
			if (!createResult.isRight()) return;

			const result = await service.deleteAgent(userCtx, createResult.value.uuid);

			expect(result.isLeft()).toBe(true);
		});

		it("should reject delete of builtin RAG agent", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = createAgentsService(repo);

			const result = await service.deleteAgent(adminCtx, RAG_AGENT_UUID);

			expect(result.isLeft()).toBe(true);
		});

		it("should reject delete of builtin aspect extractor agent", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = createAgentsService(repo);

			const result = await service.deleteAgent(adminCtx, ASPECT_FIELD_EXTRACTOR_AGENT_UUID);

			expect(result.isLeft()).toBe(true);
		});
	});
});
