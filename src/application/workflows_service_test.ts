import { describe, it } from "bdd";
import { expect } from "expect";
import { InMemoryConfigurationRepository } from "adapters/inmem/inmem_configuration_repository.ts";
import { WorkflowsService } from "./workflows_service.ts";
import type { AuthenticationContext } from "./authentication_context.ts";
import { ADMINS_GROUP_UUID } from "domain/configuration/builtin_groups.ts";
import type { WorkflowState } from "domain/configuration/workflow_data.ts";
import type { NodeFilter } from "domain/nodes/node_filter.ts";

describe("WorkflowsService", () => {
	const adminCtx: AuthenticationContext = {
		tenant: "test",
		principal: {
			email: "admin@test.com",
			groups: [ADMINS_GROUP_UUID],
		},
		mode: "Action",
	};

	const nonAdminCtx: AuthenticationContext = {
		tenant: "test",
		principal: {
			email: "user@test.com",
			groups: ["regular-users"],
		},
		mode: "Action",
	};

	describe("createWorkflow", () => {
		it("should create workflow successfully as admin", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new WorkflowsService(repo);

			const states: WorkflowState[] = [
				{
					name: "draft",
					isInitial: true,
					transitions: [
						{
							signal: "submit",
							targetState: "review",
						},
					],
				},
				{
					name: "review",
					transitions: [
						{
							signal: "approve",
							targetState: "approved",
						},
						{
							signal: "reject",
							targetState: "draft",
						},
					],
				},
				{
					name: "approved",
					isFinal: true,
				},
			];

			const filters: NodeFilter[] = [["mimetype", "==", "application/pdf"]];

			const result = await service.createWorkflow(adminCtx, {
				title: "Document Approval",
				description: "PDF approval workflow",
				states,
				availableStateNames: ["draft", "review", "approved"],
				filters,
				groupsAllowed: [ADMINS_GROUP_UUID],
			});

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				const workflow = result.value;
				expect(workflow.title).toBe("Document Approval");
				expect(workflow.states.length).toBe(3);
				expect(workflow.availableStateNames).toEqual(["draft", "review", "approved"]);
				expect(typeof workflow.uuid).toBe("string");
				expect(typeof workflow.createdTime).toBe("string");
				expect(typeof workflow.modifiedTime).toBe("string");
			}
		});

		it("should reject creation as non-admin", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new WorkflowsService(repo);

			const result = await service.createWorkflow(nonAdminCtx, {
				title: "Test Workflow",
				states: [{ name: "start", isInitial: true }],
				availableStateNames: ["start"],
				filters: [],
				groupsAllowed: [],
			});

			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) {
				expect(result.value.errorCode).toBe("ForbiddenError");
			}
		});

		it("should validate workflow has at least one state", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new WorkflowsService(repo);

			const result = await service.createWorkflow(adminCtx, {
				title: "Invalid Workflow",
				states: [],
				availableStateNames: [],
				filters: [],
				groupsAllowed: [],
			});

			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) {
				expect(result.value.errorCode).toBe("ValidationError");
			}
		});
	});

	describe("getWorkflow", () => {
		it("should get workflow successfully", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new WorkflowsService(repo);

			const createResult = await service.createWorkflow(adminCtx, {
				title: "Test Workflow",
				states: [{ name: "start", isInitial: true }],
				availableStateNames: ["start"],
				filters: [],
				groupsAllowed: [],
			});

			expect(createResult.isRight()).toBe(true);
			if (createResult.isRight()) {
				const result = await service.getWorkflow(adminCtx, createResult.value.uuid);

				expect(result.isRight()).toBe(true);
				if (result.isRight()) {
					expect(result.value.uuid).toBe(createResult.value.uuid);
					expect(result.value.title).toBe("Test Workflow");
				}
			}
		});

		it("should allow non-admin to get workflow", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new WorkflowsService(repo);

			const createResult = await service.createWorkflow(adminCtx, {
				title: "Public Workflow",
				states: [{ name: "start", isInitial: true }],
				availableStateNames: ["start"],
				filters: [],
				groupsAllowed: [],
			});

			expect(createResult.isRight()).toBe(true);
			if (createResult.isRight()) {
				const result = await service.getWorkflow(nonAdminCtx, createResult.value.uuid);

				expect(result.isRight()).toBe(true);
			}
		});
	});

	describe("listWorkflows", () => {
		it("should list all workflows", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new WorkflowsService(repo);

			await service.createWorkflow(adminCtx, {
				title: "Workflow A",
				states: [{ name: "start", isInitial: true }],
				availableStateNames: ["start"],
				filters: [],
				groupsAllowed: [],
			});

			await service.createWorkflow(adminCtx, {
				title: "Workflow B",
				states: [{ name: "start", isInitial: true }],
				availableStateNames: ["start"],
				filters: [],
				groupsAllowed: [],
			});

			const result = await service.listWorkflows(adminCtx);

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				expect(result.value.length).toBe(2);
			}
		});
	});

	describe("updateWorkflow", () => {
		it("should update workflow successfully as admin", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new WorkflowsService(repo);

			const createResult = await service.createWorkflow(adminCtx, {
				title: "Original Title",
				states: [{ name: "start", isInitial: true }],
				availableStateNames: ["start"],
				filters: [],
				groupsAllowed: [],
			});

			expect(createResult.isRight()).toBe(true);
			if (createResult.isRight()) {
				const result = await service.updateWorkflow(adminCtx, createResult.value.uuid, {
					title: "Updated Title",
				});

				expect(result.isRight()).toBe(true);
				if (result.isRight()) {
					expect(result.value.title).toBe("Updated Title");
				}
			}
		});

		it("should reject update as non-admin", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new WorkflowsService(repo);

			const createResult = await service.createWorkflow(adminCtx, {
				title: "Test Workflow",
				states: [{ name: "start", isInitial: true }],
				availableStateNames: ["start"],
				filters: [],
				groupsAllowed: [],
			});

			expect(createResult.isRight()).toBe(true);
			if (createResult.isRight()) {
				const result = await service.updateWorkflow(nonAdminCtx, createResult.value.uuid, {
					title: "Hacked",
				});

				expect(result.isLeft()).toBe(true);
				if (result.isLeft()) {
					expect(result.value.errorCode).toBe("ForbiddenError");
				}
			}
		});
	});

	describe("deleteWorkflow", () => {
		it("should delete workflow successfully as admin", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new WorkflowsService(repo);

			const createResult = await service.createWorkflow(adminCtx, {
				title: "Temporary Workflow",
				states: [{ name: "start", isInitial: true }],
				availableStateNames: ["start"],
				filters: [],
				groupsAllowed: [],
			});

			expect(createResult.isRight()).toBe(true);
			if (createResult.isRight()) {
				const deleteResult = await service.deleteWorkflow(adminCtx, createResult.value.uuid);

				expect(deleteResult.isRight()).toBe(true);

				const getResult = await service.getWorkflow(adminCtx, createResult.value.uuid);
				expect(getResult.isLeft()).toBe(true);
			}
		});

		it("should reject delete as non-admin", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new WorkflowsService(repo);

			const createResult = await service.createWorkflow(adminCtx, {
				title: "Test Workflow",
				states: [{ name: "start", isInitial: true }],
				availableStateNames: ["start"],
				filters: [],
				groupsAllowed: [],
			});

			expect(createResult.isRight()).toBe(true);
			if (createResult.isRight()) {
				const result = await service.deleteWorkflow(nonAdminCtx, createResult.value.uuid);

				expect(result.isLeft()).toBe(true);
				if (result.isLeft()) {
					expect(result.value.errorCode).toBe("ForbiddenError");
				}
			}
		});
	});
});
