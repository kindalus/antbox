import { describe, it } from "jsr:@std/testing/bdd";
import { expect } from "jsr:@std/expect";
import { WorkflowService } from "./workflow_service.ts";
import type { WorkflowServiceContext } from "./workflow_service_context.ts";
import type { AuthenticationContext } from "./authentication_context.ts";
import { InmemWorkflowInstanceRepository } from "adapters/inmem/inmem_workflow_instance_repository.ts";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository.ts";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider.ts";
import type { EventBus } from "shared/event_bus.ts";
import type { Event } from "shared/event.ts";
import type { EventHandler } from "shared/event_handler.ts";
import { NodeService } from "./node_service.ts";
import { FeatureService } from "./feature_service.ts";
import { UsersGroupsService } from "./users_groups_service.ts";
import { Groups } from "domain/users_groups/groups.ts";
import { Folders } from "domain/nodes/folders.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { WorkflowNode } from "domain/workflows/workflow_node.ts";

// Mock EventBus implementation
class MockEventBus implements EventBus {
	async publish(_event: Event): Promise<void> {}
	subscribe(_eventId: string, _handler: EventHandler<Event>): void {}
	unsubscribe(_eventId: string, _handler: EventHandler<Event>): void {}
}

describe("WorkflowService", () => {
	function createContext(): WorkflowServiceContext {
		const eventBus = new MockEventBus();
		const nodeService = new NodeService({
			repository: new InMemoryNodeRepository(),
			storage: new InMemoryStorageProvider(),
			bus: eventBus,
		});
		const usersGroupsService = new UsersGroupsService(nodeService);
		const featureService = new FeatureService({
			nodeService,
			usersGroupsService,
			eventBus,
		});

		return {
			workflowInstanceRepository: new InmemWorkflowInstanceRepository(),
			nodeService,
			featureService,
		};
	}

	function createAuthContext(
		email: string,
		groups: string[] = [Groups.ADMINS_GROUP_UUID],
	): AuthenticationContext {
		return {
			principal: {
				email,
				groups,
			},
			tenant: "test-tenant",
			mode: "Direct",
		};
	}

	function createNonAdminAuthContext(
		email: string,
		groups: string[] = ["users"],
	): AuthenticationContext {
		return {
			principal: {
				email,
				groups,
			},
			tenant: "test-tenant",
			mode: "Direct",
		};
	}

	async function createTestFolder(
		nodeService: NodeService,
		authCtx: AuthenticationContext,
	): Promise<string> {
		const folderOrErr = await nodeService.create(authCtx, {
			title: "Test Folder",
			mimetype: Nodes.FOLDER_MIMETYPE,
			parent: Folders.ROOT_FOLDER_UUID,
			permissions: {
				group: ["Read", "Write", "Export"],
				authenticated: ["Read", "Write", "Export"],
				anonymous: [],
				advanced: {},
			},
		});
		return folderOrErr.right.uuid;
	}

	async function createWorkflowsFolder(
		nodeService: NodeService,
		authCtx: AuthenticationContext,
	): Promise<void> {
		await nodeService.create(authCtx, {
			uuid: Folders.WORKFLOWS_FOLDER_UUID,
			title: "Workflows",
			mimetype: Nodes.FOLDER_MIMETYPE,
			parent: Folders.ROOT_FOLDER_UUID,
			permissions: {
				group: ["Read", "Write", "Export"],
				authenticated: ["Read", "Write", "Export"],
				anonymous: [],
				advanced: {},
			},
		});
	}

	async function createWorkflowDefinition(
		nodeService: NodeService,
		authCtx: AuthenticationContext,
	): Promise<string> {
		const workflowOrErr = WorkflowNode.create({
			title: "Test Workflow",
			owner: authCtx.principal.email,
			parent: Folders.WORKFLOWS_FOLDER_UUID,
			states: [
				{
					name: "draft",
					isInitial: true,
					transitions: [
						{
							targetState: "review",
							signal: "submit",
							actions: [],
						},
					],
				},
				{
					name: "review",
					transitions: [
						{
							targetState: "approved",
							signal: "approve",
							actions: [],
						},
						{
							targetState: "draft",
							signal: "reject",
							actions: [],
						},
					],
				},
				{
					name: "approved",
					transitions: [],
					isFinal: true,
				},
			],
			availableStateNames: ["draft", "review", "approved"],
			filters: [], // Empty filters allow all nodes
		});

		if (workflowOrErr.isLeft()) {
			throw new Error(`Failed to create workflow definition: ${workflowOrErr.value.message}`);
		}

		const savedOrErr = await nodeService.create(authCtx, workflowOrErr.right.metadata);
		if (savedOrErr.isLeft()) {
			throw new Error(`Failed to save workflow definition: ${savedOrErr.value.message}`);
		}

		return savedOrErr.right.uuid;
	}

	describe("startWorkflow", () => {
		it("should start a workflow instance for a node", async () => {
			const context = createContext();
			const service = new WorkflowService(context);
			const authCtx = createAuthContext("user@example.com");

			// Create test folder, workflow definition, and target node
			const folderUuid = await createTestFolder(context.nodeService, authCtx);
			await createWorkflowsFolder(context.nodeService, authCtx);
			const workflowDefUuid = await createWorkflowDefinition(context.nodeService, authCtx);

			const nodeOrErr = await context.nodeService.create(authCtx, {
				title: "Test Node",
				mimetype: Nodes.META_NODE_MIMETYPE,
				parent: folderUuid,
			});

			expect(nodeOrErr.isRight()).toBe(true);
			const nodeUuid = nodeOrErr.right.uuid;

			// Start workflow
			const instanceOrErr = await service.startWorkflow(authCtx, nodeUuid, workflowDefUuid);

			expect(instanceOrErr.isRight()).toBe(true);
			const instance = instanceOrErr.right;

			expect(instance.nodeUuid).toBe(nodeUuid);
			expect(instance.workflowDefinitionUuid).toBe(workflowDefUuid);
			expect(instance.currentStateName).toBe("draft");
			expect(instance.history).toEqual([]);

			// Snapshot is stored internally on the persisted instance (not exposed via DTO)
			const storedOrErr = await context.workflowInstanceRepository.getByNodeUuid(nodeUuid);
			expect(storedOrErr.isRight()).toBe(true);
			expect(storedOrErr.right.workflowDefinition?.uuid).toBe(workflowDefUuid);
			expect(storedOrErr.right.workflowDefinition?.states.map((s) => s.name)).toEqual([
				"draft",
				"review",
				"approved",
			]);
		});

		it("should lock the node when starting a workflow", async () => {
			const context = createContext();
			const service = new WorkflowService(context);
			const authCtx = createAuthContext("user@example.com");

			// Create test folder, workflow definition, and target node
			const folderUuid = await createTestFolder(context.nodeService, authCtx);
			await createWorkflowsFolder(context.nodeService, authCtx);
			const workflowDefUuid = await createWorkflowDefinition(context.nodeService, authCtx);

			const nodeOrErr = await context.nodeService.create(authCtx, {
				title: "Test Node",
				mimetype: Nodes.META_NODE_MIMETYPE,
				parent: folderUuid,
			});

			const nodeUuid = nodeOrErr.right.uuid;

			// Start workflow
			await service.startWorkflow(authCtx, nodeUuid, workflowDefUuid);

			// Verify node is locked
			const lockedNodeOrErr = await context.nodeService.get(authCtx, nodeUuid);
			expect(lockedNodeOrErr.isRight()).toBe(true);

			const lockedNode = lockedNodeOrErr.right;
			expect(lockedNode.locked).toBe(true);
			expect(lockedNode.lockedBy).toBe(authCtx.principal.email);
		});

		it("should return error if workflow definition does not exist", async () => {
			const context = createContext();
			const service = new WorkflowService(context);
			const authCtx = createAuthContext("user@example.com");

			const folderUuid = await createTestFolder(context.nodeService, authCtx);
			await createWorkflowsFolder(context.nodeService, authCtx);
			const nodeOrErr = await context.nodeService.create(authCtx, {
				title: "Test Node",
				mimetype: Nodes.META_NODE_MIMETYPE,
				parent: folderUuid,
			});

			const instanceOrErr = await service.startWorkflow(
				authCtx,
				nodeOrErr.right.uuid,
				"non-existent-uuid",
			);

			expect(instanceOrErr.isLeft()).toBe(true);
		});

		it("should return error if node already has a workflow instance", async () => {
			const context = createContext();
			const service = new WorkflowService(context);
			const authCtx = createAuthContext("user@example.com");

			const folderUuid = await createTestFolder(context.nodeService, authCtx);
			await createWorkflowsFolder(context.nodeService, authCtx);
			const workflowDefUuid = await createWorkflowDefinition(context.nodeService, authCtx);

			const nodeOrErr = await context.nodeService.create(authCtx, {
				title: "Test Node",
				mimetype: Nodes.META_NODE_MIMETYPE,
				parent: folderUuid,
			});

			const nodeUuid = nodeOrErr.right.uuid;

			// Start workflow first time
			await service.startWorkflow(authCtx, nodeUuid, workflowDefUuid);

			// Try to start again
			const secondAttempt = await service.startWorkflow(authCtx, nodeUuid, workflowDefUuid);

			expect(secondAttempt.isLeft()).toBe(true);
			if (secondAttempt.isLeft()) {
				expect(secondAttempt.value.message).toContain("already has a workflow");
			}
		});
	});

	describe("transition", () => {
		it("should transition a workflow instance to a new state", async () => {
			const context = createContext();
			const service = new WorkflowService(context);
			const authCtx = createAuthContext("user@example.com");

			// Setup
			const folderUuid = await createTestFolder(context.nodeService, authCtx);
			await createWorkflowsFolder(context.nodeService, authCtx);
			const workflowDefUuid = await createWorkflowDefinition(context.nodeService, authCtx);

			const nodeOrErr = await context.nodeService.create(authCtx, {
				title: "Test Node",
				mimetype: Nodes.META_NODE_MIMETYPE,
				parent: folderUuid,
			});

			const nodeUuid = nodeOrErr.right.uuid;
			await service.startWorkflow(authCtx, nodeUuid, workflowDefUuid);

			// Transition from draft to review
			const transitionOrErr = await service.transition(
				authCtx,
				nodeUuid,
				"submit",
				"Submitting for review",
			);

			expect(transitionOrErr.isRight()).toBe(true);

			// Verify new state
			const instanceOrErr = await service.getInstance(authCtx, nodeUuid);
			expect(instanceOrErr.isRight()).toBe(true);

			const instance = instanceOrErr.right;
			expect(instance.currentStateName).toBe("review");
			expect(instance.history).toHaveLength(1);
			expect(instance.history![0].from).toBe("draft");
			expect(instance.history![0].to).toBe("review");
			expect(instance.history![0].signal).toBe("submit");
			expect(instance.history![0].user).toBe(authCtx.principal.email);
			expect(instance.history![0].message).toBe("Submitting for review");
		});

		it("should return error for invalid signal", async () => {
			const context = createContext();
			const service = new WorkflowService(context);
			const authCtx = createAuthContext("user@example.com");

			const folderUuid = await createTestFolder(context.nodeService, authCtx);
			await createWorkflowsFolder(context.nodeService, authCtx);
			const workflowDefUuid = await createWorkflowDefinition(context.nodeService, authCtx);

			const nodeOrErr = await context.nodeService.create(authCtx, {
				title: "Test Node",
				mimetype: Nodes.META_NODE_MIMETYPE,
				parent: folderUuid,
			});

			const nodeUuid = nodeOrErr.right.uuid;
			await service.startWorkflow(authCtx, nodeUuid, workflowDefUuid);

			// Try invalid signal
			const transitionOrErr = await service.transition(authCtx, nodeUuid, "invalid-signal");

			expect(transitionOrErr.isLeft()).toBe(true);
			if (transitionOrErr.isLeft()) {
				expect(transitionOrErr.value.message).toContain("Invalid signal");
			}
		});

		it("should unlock node when reaching final state", async () => {
			const context = createContext();
			const service = new WorkflowService(context);
			const authCtx = createAuthContext("user@example.com");

			const folderUuid = await createTestFolder(context.nodeService, authCtx);
			await createWorkflowsFolder(context.nodeService, authCtx);
			const workflowDefUuid = await createWorkflowDefinition(context.nodeService, authCtx);

			const nodeOrErr = await context.nodeService.create(authCtx, {
				title: "Test Node",
				mimetype: Nodes.META_NODE_MIMETYPE,
				parent: folderUuid,
			});

			const nodeUuid = nodeOrErr.right.uuid;
			await service.startWorkflow(authCtx, nodeUuid, workflowDefUuid);

			// Transition to review
			await service.transition(authCtx, nodeUuid, "submit");

			// Transition to approved (final state)
			await service.transition(authCtx, nodeUuid, "approve");

			// Verify node is unlocked
			const nodeAfterOrErr = await context.nodeService.get(authCtx, nodeUuid);
			expect(nodeAfterOrErr.isRight()).toBe(true);

			const nodeAfter = nodeAfterOrErr.right;
			expect(nodeAfter.locked).toBe(false);
		});
	});

	describe("getInstance", () => {
		it("should get workflow instance by node UUID", async () => {
			const context = createContext();
			const service = new WorkflowService(context);
			const authCtx = createAuthContext("user@example.com");

			const folderUuid = await createTestFolder(context.nodeService, authCtx);
			await createWorkflowsFolder(context.nodeService, authCtx);
			const workflowDefUuid = await createWorkflowDefinition(context.nodeService, authCtx);

			const nodeOrErr = await context.nodeService.create(authCtx, {
				title: "Test Node",
				mimetype: Nodes.META_NODE_MIMETYPE,
				parent: folderUuid,
			});

			const nodeUuid = nodeOrErr.right.uuid;
			const createdOrErr = await service.startWorkflow(authCtx, nodeUuid, workflowDefUuid);

			// Get instance
			const instanceOrErr = await service.getInstance(authCtx, nodeUuid);

			expect(instanceOrErr.isRight()).toBe(true);
			expect(instanceOrErr.right.uuid).toBe(createdOrErr.right.uuid);
		});

		it("should return error if no instance exists", async () => {
			const context = createContext();
			const service = new WorkflowService(context);
			const authCtx = createAuthContext("user@example.com");

			const folderUuid = await createTestFolder(context.nodeService, authCtx);
			await createWorkflowsFolder(context.nodeService, authCtx);
			const nodeOrErr = await context.nodeService.create(authCtx, {
				title: "Test Node",
				mimetype: Nodes.META_NODE_MIMETYPE,
				parent: folderUuid,
			});

			const instanceOrErr = await service.getInstance(authCtx, nodeOrErr.right.uuid);

			expect(instanceOrErr.isLeft()).toBe(true);
		});
	});

	describe("findActiveInstances", () => {
		it("should find all active workflow instances", async () => {
			const context = createContext();
			const service = new WorkflowService(context);
			const authCtx = createAuthContext("user@example.com");

			const folderUuid = await createTestFolder(context.nodeService, authCtx);
			await createWorkflowsFolder(context.nodeService, authCtx);
			const workflowDefUuid = await createWorkflowDefinition(context.nodeService, authCtx);

			// Create two nodes with workflows
			const node1OrErr = await context.nodeService.create(authCtx, {
				title: "Node 1",
				mimetype: Nodes.META_NODE_MIMETYPE,
				parent: folderUuid,
			});

			const node2OrErr = await context.nodeService.create(authCtx, {
				title: "Node 2",
				mimetype: Nodes.META_NODE_MIMETYPE,
				parent: folderUuid,
			});

			await service.startWorkflow(authCtx, node1OrErr.right.uuid, workflowDefUuid);
			await service.startWorkflow(authCtx, node2OrErr.right.uuid, workflowDefUuid);

			// Move one to final state
			await service.transition(authCtx, node1OrErr.right.uuid, "submit");
			await service.transition(authCtx, node1OrErr.right.uuid, "approve");

			// Find active instances
			const activeOrErr = await service.findActiveInstances(authCtx);

			expect(activeOrErr.isRight()).toBe(true);
			expect(activeOrErr.right).toHaveLength(1);
			expect(activeOrErr.right[0].nodeUuid).toBe(node2OrErr.right.uuid);
		});

		it("should filter by workflow definition UUID", async () => {
			const context = createContext();
			const service = new WorkflowService(context);
			const authCtx = createAuthContext("user@example.com");

			const folderUuid = await createTestFolder(context.nodeService, authCtx);
			await createWorkflowsFolder(context.nodeService, authCtx);
			const workflowDef1Uuid = await createWorkflowDefinition(context.nodeService, authCtx);
			const workflowDef2Uuid = await createWorkflowDefinition(context.nodeService, authCtx);

			const node1OrErr = await context.nodeService.create(authCtx, {
				title: "Node 1",
				mimetype: Nodes.META_NODE_MIMETYPE,
				parent: folderUuid,
			});

			const node2OrErr = await context.nodeService.create(authCtx, {
				title: "Node 2",
				mimetype: Nodes.META_NODE_MIMETYPE,
				parent: folderUuid,
			});

			await service.startWorkflow(authCtx, node1OrErr.right.uuid, workflowDef1Uuid);
			await service.startWorkflow(authCtx, node2OrErr.right.uuid, workflowDef2Uuid);

			// Find active instances for workflow 1
			const activeOrErr = await service.findActiveInstances(authCtx, workflowDef1Uuid);

			expect(activeOrErr.isRight()).toBe(true);
			expect(activeOrErr.right).toHaveLength(1);
			expect(activeOrErr.right[0].workflowDefinitionUuid).toBe(workflowDef1Uuid);
		});

		it("should only return workflows that non-admin users can transition", async () => {
			const context = createContext();
			const service = new WorkflowService(context);
			const adminAuthCtx = createAuthContext("admin@example.com", [Groups.ADMINS_GROUP_UUID]);
			const editorAuthCtx = createNonAdminAuthContext("editor@example.com", ["editors"]);
			const viewerAuthCtx = createNonAdminAuthContext("viewer@example.com", ["viewers"]);

			const folderUuid = await createTestFolder(context.nodeService, adminAuthCtx);
			await createWorkflowsFolder(context.nodeService, adminAuthCtx);

			// Create workflow with group-restricted transitions
			const restrictedWorkflowOrErr = WorkflowNode.create({
				title: "Restricted Workflow",
				owner: adminAuthCtx.principal.email,
				parent: Folders.WORKFLOWS_FOLDER_UUID,
				states: [
					{
						name: "draft",
						isInitial: true,
						transitions: [
							{
								targetState: "review",
								signal: "submit",
								actions: [],
								groupsAllowed: ["editors"], // Only editors can submit
							},
						],
					},
					{
						name: "review",
						transitions: [
							{
								targetState: "approved",
								signal: "approve",
								actions: [],
								groupsAllowed: ["editors"],
							},
						],
					},
					{
						name: "approved",
						transitions: [],
						isFinal: true,
					},
				],
				availableStateNames: ["draft", "review", "approved"],
				filters: [], // Empty filters allow all nodes
			});

			const savedWorkflowOrErr = await context.nodeService.create(
				adminAuthCtx,
				restrictedWorkflowOrErr.right.metadata,
			);

			const workflowDefUuid = savedWorkflowOrErr.right.uuid;

			// Create node with workflow
			const nodeOrErr = await context.nodeService.create(adminAuthCtx, {
				title: "Test Node",
				mimetype: Nodes.META_NODE_MIMETYPE,
				parent: folderUuid,
			});

			await service.startWorkflow(adminAuthCtx, nodeOrErr.right.uuid, workflowDefUuid);

			// Admin should see all workflows
			const adminActiveOrErr = await service.findActiveInstances(adminAuthCtx);
			expect(adminActiveOrErr.isRight()).toBe(true);
			expect(adminActiveOrErr.right).toHaveLength(1);

			// Editor should see the workflow (they can transition)
			const editorActiveOrErr = await service.findActiveInstances(editorAuthCtx);
			expect(editorActiveOrErr.isRight()).toBe(true);
			expect(editorActiveOrErr.right).toHaveLength(1);

			// Viewer should NOT see the workflow (they cannot transition)
			const viewerActiveOrErr = await service.findActiveInstances(viewerAuthCtx);
			expect(viewerActiveOrErr.isRight()).toBe(true);
			expect(viewerActiveOrErr.right).toHaveLength(0);
		});

		it("should return workflows with unrestricted transitions to all users", async () => {
			const context = createContext();
			const service = new WorkflowService(context);
			const adminAuthCtx = createAuthContext("admin@example.com", [Groups.ADMINS_GROUP_UUID]);
			const userAuthCtx = createNonAdminAuthContext("user@example.com", ["users"]);

			const folderUuid = await createTestFolder(context.nodeService, adminAuthCtx);
			await createWorkflowsFolder(context.nodeService, adminAuthCtx);

			// Create workflow with no group restrictions (transitions allowed for all)
			const openWorkflowOrErr = WorkflowNode.create({
				title: "Open Workflow",
				owner: adminAuthCtx.principal.email,
				parent: Folders.WORKFLOWS_FOLDER_UUID,
				states: [
					{
						name: "draft",
						isInitial: true,
						transitions: [
							{
								targetState: "done",
								signal: "complete",
								actions: [],
								// No groupsAllowed - open to all
							},
						],
					},
					{
						name: "done",
						transitions: [],
						isFinal: true,
					},
				],
				availableStateNames: ["draft", "done"],
				filters: [], // Empty filters allow all nodes
			});

			const savedWorkflowOrErr = await context.nodeService.create(
				adminAuthCtx,
				openWorkflowOrErr.right.metadata,
			);

			const workflowDefUuid = savedWorkflowOrErr.right.uuid;

			// Create node with workflow
			const nodeOrErr = await context.nodeService.create(adminAuthCtx, {
				title: "Test Node",
				mimetype: Nodes.META_NODE_MIMETYPE,
				parent: folderUuid,
			});

			await service.startWorkflow(adminAuthCtx, nodeOrErr.right.uuid, workflowDefUuid);

			// Both admin and regular user should see the workflow
			const adminActiveOrErr = await service.findActiveInstances(adminAuthCtx);
			expect(adminActiveOrErr.isRight()).toBe(true);
			expect(adminActiveOrErr.right).toHaveLength(1);

			const userActiveOrErr = await service.findActiveInstances(userAuthCtx);
			expect(userActiveOrErr.isRight()).toBe(true);
			expect(userActiveOrErr.right).toHaveLength(1);
		});
	});
});
