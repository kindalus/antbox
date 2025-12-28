import { describe, it } from "bdd";
import { expect } from "expect";
import type { AuthenticationContext } from "application/security/authentication_context.ts";
import { InMemoryConfigurationRepository } from "adapters/inmem/inmem_configuration_repository.ts";
import { WorkflowInstancesService } from "application/workflows/workflow_instances_service.ts";
import { WorkflowsService } from "application/workflows/workflows_service.ts";
import { ADMINS_GROUP_UUID } from "domain/configuration/builtin_groups.ts";
import type { WorkflowInstanceData } from "domain/configuration/workflow_instance_data.ts";

describe("WorkflowInstancesService", () => {
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

	const editorCtx: AuthenticationContext = {
		tenant: "test",
		principal: {
			email: "editor@example.com",
			groups: ["--editors--"],
		},
		mode: "Action",
	};

	function createService(repo: InMemoryConfigurationRepository) {
		const workflowsService = new WorkflowsService(repo);
		return new WorkflowInstancesService({
			configRepo: repo,
			workflowsService,
		});
	}

	function createWorkflowInstance(
		uuid: string,
		nodeUuid: string,
		groupsAllowed: string[] = [],
	): WorkflowInstanceData {
		return {
			uuid,
			workflowDefinitionUuid: "workflow-def-1",
			workflowDefinition: {
				uuid: "workflow-def-1",
				title: "Test Workflow",
				description: "A test workflow",
				createdTime: new Date().toISOString(),
				modifiedTime: new Date().toISOString(),
				states: [
					{
						name: "draft",
						isInitial: true,
						transitions: [{ signal: "submit", targetState: "review" }],
					},
					{ name: "review", isFinal: true },
				],
				availableStateNames: ["draft", "review"],
				groupsAllowed: [],
			},
			nodeUuid,
			currentStateName: "draft",
			history: [],
			running: true,
			cancelled: false,
			groupsAllowed,
			owner: "admin@example.com",
			startedTime: new Date().toISOString(),
			modifiedTime: new Date().toISOString(),
		};
	}

	describe("getWorkflowInstance", () => {
		it("should get workflow instance with permission", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = createService(repo);

			const instance = createWorkflowInstance("instance-1", "node-123", ["--editors--"]);
			await repo.save("workflowInstances", instance);

			const result = await service.getWorkflowInstance(editorCtx, "instance-1");

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				expect(result.value.uuid).toBe("instance-1");
				expect(result.value.nodeUuid).toBe("node-123");
				expect(result.value.currentStateName).toBe("draft");
			}
		});

		it("should allow admin to get any workflow instance", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = createService(repo);

			const instance = createWorkflowInstance("instance-1", "node-123", ["--editors--"]);
			await repo.save("workflowInstances", instance);

			const result = await service.getWorkflowInstance(adminCtx, "instance-1");

			expect(result.isRight()).toBe(true);
		});

		it("should reject get without permission", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = createService(repo);

			const instance = createWorkflowInstance("instance-1", "node-123", ["--editors--"]);
			await repo.save("workflowInstances", instance);

			const result = await service.getWorkflowInstance(userCtx, "instance-1");

			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) {
				expect(result.value.errorCode).toBe("ForbiddenError");
			}
		});

		it("should allow access when groupsAllowed is empty", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = createService(repo);

			const instance = createWorkflowInstance("instance-1", "node-123", []);
			await repo.save("workflowInstances", instance);

			const result = await service.getWorkflowInstance(userCtx, "instance-1");

			expect(result.isRight()).toBe(true);
		});

		it("should return error for non-existent instance", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = createService(repo);

			const result = await service.getWorkflowInstance(adminCtx, "non-existent");

			expect(result.isLeft()).toBe(true);
		});
	});

	describe("getWorkflowInstanceByNodeUuid", () => {
		it("should find workflow instance by node UUID", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = createService(repo);

			const instance = createWorkflowInstance("instance-1", "node-456", []);
			await repo.save("workflowInstances", instance);

			const result = await service.getWorkflowInstanceByNodeUuid(adminCtx, "node-456");

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				expect(result.value.nodeUuid).toBe("node-456");
				expect(result.value.uuid).toBe("instance-1");
			}
		});

		it("should reject access without permission", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = createService(repo);

			const instance = createWorkflowInstance("instance-1", "node-456", ["--editors--"]);
			await repo.save("workflowInstances", instance);

			const result = await service.getWorkflowInstanceByNodeUuid(userCtx, "node-456");

			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) {
				expect(result.value.errorCode).toBe("ForbiddenError");
			}
		});

		it("should return error when no instance exists for node", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = createService(repo);

			const result = await service.getWorkflowInstanceByNodeUuid(adminCtx, "non-existent-node");

			expect(result.isLeft()).toBe(true);
		});
	});

	describe("listWorkflowInstances", () => {
		it("should list all instances for admin", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = createService(repo);

			await repo.save(
				"workflowInstances",
				createWorkflowInstance("instance-1", "node-1", ["--editors--"]),
			);
			await repo.save(
				"workflowInstances",
				createWorkflowInstance("instance-2", "node-2", ["--users--"]),
			);
			await repo.save("workflowInstances", createWorkflowInstance("instance-3", "node-3", []));

			const result = await service.listWorkflowInstances(adminCtx);

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				expect(result.value.length).toBe(3);
			}
		});

		it("should list only permitted instances for non-admin", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = createService(repo);

			await repo.save(
				"workflowInstances",
				createWorkflowInstance("instance-1", "node-1", ["--editors--"]),
			);
			await repo.save(
				"workflowInstances",
				createWorkflowInstance("instance-2", "node-2", ["--users--"]),
			);
			await repo.save("workflowInstances", createWorkflowInstance("instance-3", "node-3", []));

			// Editor should see editors instance and public instance
			const editorResult = await service.listWorkflowInstances(editorCtx);

			expect(editorResult.isRight()).toBe(true);
			if (editorResult.isRight()) {
				expect(editorResult.value.length).toBe(2);
				const uuids = editorResult.value.map((i) => i.uuid);
				expect(uuids).toContain("instance-1");
				expect(uuids).toContain("instance-3");
			}

			// User should see users instance and public instance
			const userResult = await service.listWorkflowInstances(userCtx);

			expect(userResult.isRight()).toBe(true);
			if (userResult.isRight()) {
				expect(userResult.value.length).toBe(2);
				const uuids = userResult.value.map((i) => i.uuid);
				expect(uuids).toContain("instance-2");
				expect(uuids).toContain("instance-3");
			}
		});

		it("should return empty list when no instances exist", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = createService(repo);

			const result = await service.listWorkflowInstances(adminCtx);

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				expect(result.value.length).toBe(0);
			}
		});

		it("should sort instances by startedTime descending", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = createService(repo);

			const oldInstance = createWorkflowInstance("instance-old", "node-1", []);
			(oldInstance as { startedTime: string }).startedTime = "2024-01-01T00:00:00.000Z";

			const newInstance = createWorkflowInstance("instance-new", "node-2", []);
			(newInstance as { startedTime: string }).startedTime = "2024-12-01T00:00:00.000Z";

			await repo.save("workflowInstances", oldInstance);
			await repo.save("workflowInstances", newInstance);

			const result = await service.listWorkflowInstances(adminCtx);

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				expect(result.value[0].uuid).toBe("instance-new");
				expect(result.value[1].uuid).toBe("instance-old");
			}
		});
	});

	describe("deleteWorkflowInstance", () => {
		it("should delete workflow instance as admin", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = createService(repo);

			const instance = createWorkflowInstance("instance-1", "node-123", []);
			await repo.save("workflowInstances", instance);

			const result = await service.deleteWorkflowInstance(adminCtx, "instance-1");

			expect(result.isRight()).toBe(true);

			// Verify it's gone
			const getResult = await service.getWorkflowInstance(adminCtx, "instance-1");
			expect(getResult.isLeft()).toBe(true);
		});

		it("should reject delete as non-admin", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = createService(repo);

			const instance = createWorkflowInstance("instance-1", "node-123", []);
			await repo.save("workflowInstances", instance);

			const result = await service.deleteWorkflowInstance(userCtx, "instance-1");

			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) {
				expect(result.value.errorCode).toBe("ForbiddenError");
			}

			// Verify it still exists
			const getResult = await service.getWorkflowInstance(adminCtx, "instance-1");
			expect(getResult.isRight()).toBe(true);
		});

		it("should reject delete as editor", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = createService(repo);

			const instance = createWorkflowInstance("instance-1", "node-123", ["--editors--"]);
			await repo.save("workflowInstances", instance);

			const result = await service.deleteWorkflowInstance(editorCtx, "instance-1");

			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) {
				expect(result.value.errorCode).toBe("ForbiddenError");
			}
		});

		it("should return error for non-existent instance", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = createService(repo);

			const result = await service.deleteWorkflowInstance(adminCtx, "non-existent");

			expect(result.isLeft()).toBe(true);
		});
	});
});
