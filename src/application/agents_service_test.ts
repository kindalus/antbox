import { describe, it } from "bdd";
import { expect } from "expect";
import type { AuthenticationContext } from "application/authentication_context.ts";
import { InMemoryConfigurationRepository } from "adapters/inmem/inmem_configuration_repository.ts";
import { AgentsService } from "application/agents_service.ts";
import { ADMINS_GROUP_UUID } from "domain/configuration/builtin_groups.ts";
import { RAG_AGENT_UUID } from "domain/configuration/builtin_agents.ts";

// Mock dependencies for testing (AI features not needed for CRUD tests)
const mockNodeService = null as any;
const mockFeatureService = null as any;
const mockAspectsService = null as any;
const mockDefaultModel = null as any;
const mockModels: any[] = [];

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

	describe("createAgent", () => {
		it("should create agent successfully as admin", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new AgentsService(
				repo,
				mockNodeService,
				mockFeatureService,
				mockAspectsService,
				mockDefaultModel,
				mockModels,
			);

			const result = await service.createAgent(adminCtx, {
				title: "Customer Support Agent",
				description: "Handles customer inquiries",
				model: "gpt-4",
				temperature: 0.8,
				maxTokens: 4096,
				reasoning: true,
				useTools: true,
				systemInstructions: "You are a helpful customer support agent.",
				structuredAnswer: undefined,
			});

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				const agent = result.value;
				expect(agent.uuid).toBeDefined();
				expect(agent.title).toBe("Customer Support Agent");
				expect(agent.description).toBe("Handles customer inquiries");
				expect(agent.model).toBe("gpt-4");
				expect(agent.temperature).toBe(0.8);
				expect(agent.maxTokens).toBe(4096);
				expect(agent.reasoning).toBe(true);
				expect(agent.useTools).toBe(true);
				expect(agent.systemInstructions).toBe("You are a helpful customer support agent.");
				expect(agent.createdTime).toBeDefined();
				expect(agent.modifiedTime).toBeDefined();
			}
		});

		it("should reject creation as non-admin", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new AgentsService(
				repo,
				mockNodeService,
				mockFeatureService,
				mockAspectsService,
				mockDefaultModel,
				mockModels,
			);

			const result = await service.createAgent(userCtx, {
				title: "Test Agent",
				description: "Test",
				model: "gpt-4",
				temperature: 0.7,
				maxTokens: 4096,
				reasoning: false,
				useTools: true,
				systemInstructions: "Test instructions",
			});

			expect(result.isLeft()).toBe(true);
		});

		it("should validate temperature range", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new AgentsService(repo, mockNodeService, mockFeatureService, mockAspectsService, mockDefaultModel, mockModels);

			const result = await service.createAgent(adminCtx, {
				title: "Invalid Agent",
				description: "Invalid temperature",
				model: "gpt-4",
				temperature: 3.0, // Invalid: > 2
				maxTokens: 4096,
				reasoning: false,
				useTools: true,
				systemInstructions: "Test instructions",
			});

			expect(result.isLeft()).toBe(true);
		});

		it("should validate required fields", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new AgentsService(repo, mockNodeService, mockFeatureService, mockAspectsService, mockDefaultModel, mockModels);

			const result = await service.createAgent(adminCtx, {
				title: "",
				description: "Missing title",
				model: "gpt-4",
				temperature: 0.7,
				maxTokens: 4096,
				reasoning: false,
				useTools: true,
				systemInstructions: "Test instructions",
			});

			expect(result.isLeft()).toBe(true);
		});
	});

	describe("getAgent", () => {
		it("should get agent successfully", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new AgentsService(repo, mockNodeService, mockFeatureService, mockAspectsService, mockDefaultModel, mockModels);

			const createResult = await service.createAgent(adminCtx, {
				title: "Test Agent",
				description: "Test description",
				model: "gpt-4",
				temperature: 0.7,
				maxTokens: 4096,
				reasoning: false,
				useTools: true,
				systemInstructions: "Test instructions",
			});

			expect(createResult.isRight()).toBe(true);
			if (!createResult.isRight()) return;

			const result = await service.getAgent(adminCtx, createResult.value.uuid);

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				expect(result.value.uuid).toBe(createResult.value.uuid);
			}
		});

		it("should get builtin agent", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new AgentsService(repo, mockNodeService, mockFeatureService, mockAspectsService, mockDefaultModel, mockModels);

			const result = await service.getAgent(adminCtx, RAG_AGENT_UUID);

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				expect(result.value.uuid).toBe(RAG_AGENT_UUID);
				expect(result.value.title).toBe("RAG Agent");
			}
		});

		it("should allow non-admin to get agent", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new AgentsService(repo, mockNodeService, mockFeatureService, mockAspectsService, mockDefaultModel, mockModels);

			const createResult = await service.createAgent(adminCtx, {
				title: "Public Agent",
				description: "Accessible to all",
				model: "gpt-4",
				temperature: 0.7,
				maxTokens: 4096,
				reasoning: false,
				useTools: true,
				systemInstructions: "Public instructions",
			});

			expect(createResult.isRight()).toBe(true);
			if (!createResult.isRight()) return;

			const result = await service.getAgent(userCtx, createResult.value.uuid);

			expect(result.isRight()).toBe(true);
		});
	});

	describe("listAgents", () => {
		it("should list all agents including builtins", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new AgentsService(repo, mockNodeService, mockFeatureService, mockAspectsService, mockDefaultModel, mockModels);

			// Create two custom agents
			await service.createAgent(adminCtx, {
				title: "Agent A",
				description: "First agent",
				model: "gpt-4",
				temperature: 0.7,
				maxTokens: 4096,
				reasoning: false,
				useTools: true,
				systemInstructions: "Instructions A",
			});

			await service.createAgent(adminCtx, {
				title: "Agent B",
				description: "Second agent",
				model: "gpt-4",
				temperature: 0.7,
				maxTokens: 4096,
				reasoning: false,
				useTools: true,
				systemInstructions: "Instructions B",
			});

			const result = await service.listAgents(adminCtx);

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				// Should include 2 custom agents + 1 builtin (RAG Agent)
				expect(result.value.length).toBe(3);
			}
		});

		it("should allow non-admin to list agents", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new AgentsService(repo, mockNodeService, mockFeatureService, mockAspectsService, mockDefaultModel, mockModels);

			await service.createAgent(adminCtx, {
				title: "Test Agent",
				description: "Test",
				model: "gpt-4",
				temperature: 0.7,
				maxTokens: 4096,
				reasoning: false,
				useTools: true,
				systemInstructions: "Test instructions",
			});

			const result = await service.listAgents(userCtx);

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				expect(result.value.length).toBeGreaterThan(0);
			}
		});
	});

	describe("updateAgent", () => {
		it("should update agent successfully as admin", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new AgentsService(repo, mockNodeService, mockFeatureService, mockAspectsService, mockDefaultModel, mockModels);

			const createResult = await service.createAgent(adminCtx, {
				title: "Original Title",
				description: "Original description",
				model: "gpt-4",
				temperature: 0.7,
				maxTokens: 4096,
				reasoning: false,
				useTools: true,
				systemInstructions: "Original instructions",
			});

			expect(createResult.isRight()).toBe(true);
			if (!createResult.isRight()) return;

			const result = await service.updateAgent(adminCtx, createResult.value.uuid, {
				title: "Updated Title",
				temperature: 0.9,
			});

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				expect(result.value.title).toBe("Updated Title");
				expect(result.value.temperature).toBe(0.9);
				expect(result.value.description).toBe("Original description");
				expect(result.value.createdTime).toBe(createResult.value.createdTime);
				expect(result.value.modifiedTime).toBeDefined();
			}
		});

		it("should reject update as non-admin", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new AgentsService(repo, mockNodeService, mockFeatureService, mockAspectsService, mockDefaultModel, mockModels);

			const createResult = await service.createAgent(adminCtx, {
				title: "Test Agent",
				description: "Test",
				model: "gpt-4",
				temperature: 0.7,
				maxTokens: 4096,
				reasoning: false,
				useTools: true,
				systemInstructions: "Test instructions",
			});

			expect(createResult.isRight()).toBe(true);
			if (!createResult.isRight()) return;

			const result = await service.updateAgent(userCtx, createResult.value.uuid, {
				title: "Hacked Title",
			});

			expect(result.isLeft()).toBe(true);
		});

		it("should reject update of builtin agent", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new AgentsService(repo, mockNodeService, mockFeatureService, mockAspectsService, mockDefaultModel, mockModels);

			const result = await service.updateAgent(adminCtx, RAG_AGENT_UUID, {
				title: "Modified RAG Agent",
			});

			expect(result.isLeft()).toBe(true);
		});

		it("should validate updated values", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new AgentsService(repo, mockNodeService, mockFeatureService, mockAspectsService, mockDefaultModel, mockModels);

			const createResult = await service.createAgent(adminCtx, {
				title: "Test Agent",
				description: "Test",
				model: "gpt-4",
				temperature: 0.7,
				maxTokens: 4096,
				reasoning: false,
				useTools: true,
				systemInstructions: "Test instructions",
			});

			expect(createResult.isRight()).toBe(true);
			if (!createResult.isRight()) return;

			const result = await service.updateAgent(adminCtx, createResult.value.uuid, {
				temperature: 5.0, // Invalid: > 2
			});

			expect(result.isLeft()).toBe(true);
		});
	});

	describe("deleteAgent", () => {
		it("should delete agent successfully as admin", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new AgentsService(repo, mockNodeService, mockFeatureService, mockAspectsService, mockDefaultModel, mockModels);

			const createResult = await service.createAgent(adminCtx, {
				title: "To Delete",
				description: "Will be deleted",
				model: "gpt-4",
				temperature: 0.7,
				maxTokens: 4096,
				reasoning: false,
				useTools: true,
				systemInstructions: "Test instructions",
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
			const service = new AgentsService(repo, mockNodeService, mockFeatureService, mockAspectsService, mockDefaultModel, mockModels);

			const createResult = await service.createAgent(adminCtx, {
				title: "Protected Agent",
				description: "Cannot be deleted by users",
				model: "gpt-4",
				temperature: 0.7,
				maxTokens: 4096,
				reasoning: false,
				useTools: true,
				systemInstructions: "Test instructions",
			});

			expect(createResult.isRight()).toBe(true);
			if (!createResult.isRight()) return;

			const result = await service.deleteAgent(userCtx, createResult.value.uuid);

			expect(result.isLeft()).toBe(true);
		});

		it("should reject delete of builtin agent", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new AgentsService(repo, mockNodeService, mockFeatureService, mockAspectsService, mockDefaultModel, mockModels);

			const result = await service.deleteAgent(adminCtx, RAG_AGENT_UUID);

			expect(result.isLeft()).toBe(true);
		});
	});
});
