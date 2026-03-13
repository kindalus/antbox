import { describe, it } from "bdd";
import { expect } from "expect";
import { type Either, left, right } from "shared/either.ts";
import type { AntboxError } from "shared/antbox_error.ts";
import type { AuthenticationContext } from "application/security/authentication_context.ts";
import { InMemoryConfigurationRepository } from "adapters/inmem/inmem_configuration_repository.ts";
import { WorkflowsService } from "application/workflows/workflows_service.ts";
import { WorkflowInstancesService } from "application/workflows/workflow_instances_service.ts";
import { WorkflowInstancesEngine } from "application/workflows/workflow_instances_engine.ts";
import { ADMINS_GROUP_UUID } from "domain/configuration/builtin_groups.ts";
import type { NodeMetadata } from "domain/nodes/node_metadata.ts";
import type { NodeService } from "application/nodes/node_service.ts";
import type { FeaturesEngine } from "application/features/features_engine.ts";
import type { WorkflowData } from "domain/configuration/workflow_data.ts";

// ============================================================================
// TEST CONTEXTS
// ============================================================================

const adminCtx: AuthenticationContext = {
	tenant: "test",
	principal: { email: "admin@example.com", groups: [ADMINS_GROUP_UUID] },
	mode: "Action",
};

const ownerCtx: AuthenticationContext = {
	tenant: "test",
	principal: { email: "owner@example.com", groups: ["--editors--"] },
	mode: "Action",
};

const otherCtx: AuthenticationContext = {
	tenant: "test",
	principal: { email: "other@example.com", groups: ["--viewers--"] },
	mode: "Action",
};

// ============================================================================
// STUB TYPES
// ============================================================================

interface NodeServiceStub {
	nodeMetadata: NodeMetadata;
	lockCalls: Array<{ uuid: string; groups: string[] }>;
	unlockCalls: string[];
	updateCalls: Array<{ uuid: string; metadata: Partial<NodeMetadata> }>;
	updateFileCalls: Array<{ uuid: string; file: File }>;
	service: NodeService;
}

interface FeaturesEngineStub {
	calls: Array<{ actionUuid: string; uuids: string[] }>;
	engine: FeaturesEngine;
	failOn?: string;
}

// ============================================================================
// STUB FACTORIES
// ============================================================================

function makeNodeServiceStub(metadata: Partial<NodeMetadata> = {}): NodeServiceStub {
	const stub: NodeServiceStub = {
		nodeMetadata: {
			uuid: "node-001",
			fid: "node-001",
			title: "Test Node",
			mimetype: "application/pdf",
			parent: "--root--",
			owner: "owner@example.com",
			createdTime: new Date().toISOString(),
			modifiedTime: new Date().toISOString(),
			locked: false,
			lockedBy: "",
			unlockAuthorizedGroups: [],
			...metadata,
		},
		lockCalls: [],
		unlockCalls: [],
		updateCalls: [],
		updateFileCalls: [],
		service: null as unknown as NodeService,
	};

	stub.service = {
		get: (_ctx: AuthenticationContext, _uuid: string) =>
			Promise.resolve(right(stub.nodeMetadata)),
		lock: (_ctx: AuthenticationContext, uuid: string, groups: string[]) => {
			stub.lockCalls.push({ uuid, groups: groups ?? [] });
			stub.nodeMetadata = { ...stub.nodeMetadata, locked: true };
			return Promise.resolve(right(undefined));
		},
		unlock: (_ctx: AuthenticationContext, uuid: string) => {
			stub.unlockCalls.push(uuid);
			stub.nodeMetadata = { ...stub.nodeMetadata, locked: false };
			return Promise.resolve(right(undefined));
		},
		update: (_ctx: AuthenticationContext, uuid: string, m: Partial<NodeMetadata>) => {
			stub.updateCalls.push({ uuid, metadata: m });
			return Promise.resolve(right(undefined));
		},
		updateFile: (_ctx: AuthenticationContext, uuid: string, file: File) => {
			stub.updateFileCalls.push({ uuid, file });
			return Promise.resolve(right(undefined));
		},
	} as unknown as NodeService;

	return stub;
}

function makeFeaturesEngineStub(failOn?: string): FeaturesEngineStub {
	const stub: FeaturesEngineStub = {
		calls: [],
		failOn,
		engine: null as unknown as FeaturesEngine,
	};

	stub.engine = {
		runAction: <T>(_ctx: AuthenticationContext, uuid: string, uuids: string[]) => {
			stub.calls.push({ actionUuid: uuid, uuids });
			if (stub.failOn && uuid === stub.failOn) {
				return Promise.resolve(left({ message: "action failed" } as AntboxError));
			}
			return Promise.resolve(right(undefined) as Either<AntboxError, T>);
		},
	} as unknown as FeaturesEngine;

	return stub;
}

// ============================================================================
// ENGINE FACTORY
// ============================================================================

interface TestHarness {
	engine: WorkflowInstancesEngine;
	nodeStub: NodeServiceStub;
	featuresStub: FeaturesEngineStub;
	workflowsService: WorkflowsService;
	instancesService: WorkflowInstancesService;
	repo: InMemoryConfigurationRepository;
}

function makeHarness(
	nodeMetadata?: Partial<NodeMetadata>,
	failActionOn?: string,
): TestHarness {
	const repo = new InMemoryConfigurationRepository();
	const workflowsService = new WorkflowsService(repo);
	const instancesService = new WorkflowInstancesService({ configRepo: repo, workflowsService });
	const nodeStub = makeNodeServiceStub(nodeMetadata);
	const featuresStub = makeFeaturesEngineStub(failActionOn);

	const engine = new WorkflowInstancesEngine({
		configRepo: repo,
		nodeService: nodeStub.service,
		workflowsService,
		workflowInstancesService: instancesService,
		featuresEngine: featuresStub.engine,
	});

	return { engine, nodeStub, featuresStub, workflowsService, instancesService, repo };
}

// ============================================================================
// WORKFLOW DEFINITION FIXTURES
// ============================================================================

const BASE_WORKFLOW: Omit<WorkflowData, "uuid" | "createdTime" | "modifiedTime"> = {
	title: "Test Approval",
	description: "Two-state approval workflow",
	states: [
		{
			name: "draft",
			isInitial: true,
			onExit: ["action-on-exit"],
			transitions: [
				{
					signal: "submit",
					targetState: "review",
					actions: ["action-on-transition"],
					groupsAllowed: ["--editors--"],
				},
			],
		},
		{
			name: "review",
			isFinal: true,
			onEnter: ["action-on-enter"],
		},
	],
	availableStateNames: ["draft", "review"],
	filters: [["mimetype", "==", "application/pdf"]],
	groupsAllowed: ["--editors--"],
};

async function createWorkflowDef(
	workflowsService: WorkflowsService,
	overrides: Partial<typeof BASE_WORKFLOW> = {},
): Promise<WorkflowData> {
	const defOrErr = await workflowsService.createWorkflow(adminCtx, {
		...BASE_WORKFLOW,
		...overrides,
	});
	if (defOrErr.isLeft()) throw new Error(`Failed to create workflow: ${defOrErr.value.message}`);
	return defOrErr.value;
}

// ============================================================================
// TESTS
// ============================================================================

describe("WorkflowInstancesEngine", () => {
	describe("startWorkflow", () => {
		it("should start workflow instance on node", async () => {
			const { engine, workflowsService } = makeHarness();
			const def = await createWorkflowDef(workflowsService);

			const result = await engine.startWorkflow(ownerCtx, "node-001", def.uuid);

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				expect(result.value.nodeUuid).toBe("node-001");
				expect(result.value.workflowDefinitionUuid).toBe(def.uuid);
				expect(result.value.currentStateName).toBe("draft");
				expect(result.value.running).toBe(true);
				expect(result.value.cancelled).toBe(false);
			}
		});

		it("should reject if node already has a running workflow instance", async () => {
			const { engine, workflowsService } = makeHarness();
			const def = await createWorkflowDef(workflowsService);

			await engine.startWorkflow(ownerCtx, "node-001", def.uuid);
			const second = await engine.startWorkflow(ownerCtx, "node-001", def.uuid);

			expect(second.isLeft()).toBe(true);
		});

		it("should reject if node is locked", async () => {
			const { engine, workflowsService } = makeHarness({ locked: true });
			const def = await createWorkflowDef(workflowsService);

			const result = await engine.startWorkflow(ownerCtx, "node-001", def.uuid);

			expect(result.isLeft()).toBe(true);
		});

		it("should reject if node does not match workflow filters", async () => {
			// Node has mimetype text/plain but workflow requires application/pdf
			const { engine, workflowsService } = makeHarness({ mimetype: "text/plain" });
			const def = await createWorkflowDef(workflowsService);

			const result = await engine.startWorkflow(ownerCtx, "node-001", def.uuid);

			expect(result.isLeft()).toBe(true);
		});

		it("should lock the node when starting the workflow", async () => {
			const { engine, workflowsService, nodeStub } = makeHarness();
			const def = await createWorkflowDef(workflowsService);

			await engine.startWorkflow(ownerCtx, "node-001", def.uuid);

			expect(nodeStub.lockCalls.length).toBe(1);
			expect(nodeStub.lockCalls[0].uuid).toBe("node-001");
		});

		it("should create a workflow definition snapshot in the instance", async () => {
			const { engine, workflowsService } = makeHarness();
			const def = await createWorkflowDef(workflowsService);

			const result = await engine.startWorkflow(ownerCtx, "node-001", def.uuid);

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				const snapshot = result.value.workflowDefinition;
				expect(snapshot).toBeDefined();
				expect(snapshot.uuid).toBe(def.uuid);
				expect(snapshot.states.length).toBe(def.states.length);
				expect(snapshot.availableStateNames).toEqual(def.availableStateNames);
			}
		});
	});

	describe("transition", () => {
		async function startedInstance(engine: WorkflowInstancesEngine, defUuid: string) {
			const r = await engine.startWorkflow(ownerCtx, "node-001", defUuid);
			if (r.isLeft()) throw new Error(`startWorkflow failed: ${r.value.message}`);
			return r.value;
		}

		it("should transition to target state", async () => {
			const { engine, workflowsService } = makeHarness();
			const def = await createWorkflowDef(workflowsService);
			const instance = await startedInstance(engine, def.uuid);

			const result = await engine.transition(ownerCtx, instance.uuid, "submit");

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				expect(result.value.currentStateName).toBe("review");
			}
		});

		it("should reject an invalid signal for the current state", async () => {
			const { engine, workflowsService } = makeHarness();
			const def = await createWorkflowDef(workflowsService);
			const instance = await startedInstance(engine, def.uuid);

			const result = await engine.transition(ownerCtx, instance.uuid, "nonexistent-signal");

			expect(result.isLeft()).toBe(true);
		});

		it("should reject if user is not in the transition's groupsAllowed", async () => {
			const { engine, workflowsService } = makeHarness();
			const def = await createWorkflowDef(workflowsService);
			const instance = await startedInstance(engine, def.uuid);

			// otherCtx is in --viewers--, not --editors--
			const result = await engine.transition(otherCtx, instance.uuid, "submit");

			expect(result.isLeft()).toBe(true);
		});

		it("should execute onExit actions when leaving a state", async () => {
			const { engine, workflowsService, featuresStub } = makeHarness();
			const def = await createWorkflowDef(workflowsService);
			const instance = await startedInstance(engine, def.uuid);

			await engine.transition(ownerCtx, instance.uuid, "submit");

			const executedIds = featuresStub.calls.map((c) => c.actionUuid);
			expect(executedIds).toContain("action-on-exit");
		});

		it("should execute transition actions", async () => {
			const { engine, workflowsService, featuresStub } = makeHarness();
			const def = await createWorkflowDef(workflowsService);
			const instance = await startedInstance(engine, def.uuid);

			await engine.transition(ownerCtx, instance.uuid, "submit");

			const executedIds = featuresStub.calls.map((c) => c.actionUuid);
			expect(executedIds).toContain("action-on-transition");
		});

		it("should execute onEnter actions when entering a state", async () => {
			const { engine, workflowsService, featuresStub } = makeHarness();
			const def = await createWorkflowDef(workflowsService);
			const instance = await startedInstance(engine, def.uuid);

			await engine.transition(ownerCtx, instance.uuid, "submit");

			const executedIds = featuresStub.calls.map((c) => c.actionUuid);
			expect(executedIds).toContain("action-on-enter");
		});

		it("should execute actions in the correct order: onExit → transition → onEnter", async () => {
			const { engine, workflowsService, featuresStub } = makeHarness();
			const def = await createWorkflowDef(workflowsService);
			const instance = await startedInstance(engine, def.uuid);

			await engine.transition(ownerCtx, instance.uuid, "submit");

			const executedIds = featuresStub.calls.map((c) => c.actionUuid);
			expect(executedIds).toEqual([
				"action-on-exit",
				"action-on-transition",
				"action-on-enter",
			]);
		});

		it("should append the transition to history", async () => {
			const { engine, workflowsService } = makeHarness();
			const def = await createWorkflowDef(workflowsService);
			const instance = await startedInstance(engine, def.uuid);

			const result = await engine.transition(ownerCtx, instance.uuid, "submit", "looks good");

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				expect(result.value.history.length).toBe(1);
				const entry = result.value.history[0];
				expect(entry.from).toBe("draft");
				expect(entry.to).toBe("review");
				expect(entry.signal).toBe("submit");
				expect(entry.user).toBe(ownerCtx.principal.email);
				expect(entry.message).toBe("looks good");
			}
		});

		it("should unlock the node when reaching a final state", async () => {
			const { engine, workflowsService, nodeStub } = makeHarness();
			const def = await createWorkflowDef(workflowsService);
			const instance = await startedInstance(engine, def.uuid);

			await engine.transition(ownerCtx, instance.uuid, "submit");

			expect(nodeStub.unlockCalls.length).toBe(1);
			expect(nodeStub.unlockCalls[0]).toBe("node-001");
		});

		it("should mark the instance as not running when reaching a final state", async () => {
			const { engine, workflowsService } = makeHarness();
			const def = await createWorkflowDef(workflowsService);
			const instance = await startedInstance(engine, def.uuid);

			const result = await engine.transition(ownerCtx, instance.uuid, "submit");

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				expect(result.value.running).toBe(false);
			}
		});
	});

	describe("cancelWorkflow", () => {
		async function startedInstance(engine: WorkflowInstancesEngine, defUuid: string) {
			const r = await engine.startWorkflow(ownerCtx, "node-001", defUuid);
			if (r.isLeft()) throw new Error(`startWorkflow failed: ${r.value.message}`);
			return r.value;
		}

		it("should cancel a running workflow instance", async () => {
			const { engine, workflowsService } = makeHarness();
			const def = await createWorkflowDef(workflowsService);
			const instance = await startedInstance(engine, def.uuid);

			const result = await engine.cancelWorkflow(ownerCtx, instance.uuid);

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				expect(result.value.cancelled).toBe(true);
				expect(result.value.running).toBe(false);
			}
		});

		it("should allow admin to cancel any instance", async () => {
			const { engine, workflowsService } = makeHarness();
			const def = await createWorkflowDef(workflowsService);
			const instance = await startedInstance(engine, def.uuid);

			const result = await engine.cancelWorkflow(adminCtx, instance.uuid);

			expect(result.isRight()).toBe(true);
		});

		it("should reject cancel if caller is not the owner or admin", async () => {
			const { engine, workflowsService } = makeHarness();
			const def = await createWorkflowDef(workflowsService);
			const instance = await startedInstance(engine, def.uuid);

			const result = await engine.cancelWorkflow(otherCtx, instance.uuid);

			expect(result.isLeft()).toBe(true);
		});

		it("should reject cancel if the instance is already cancelled", async () => {
			const { engine, workflowsService } = makeHarness();
			const def = await createWorkflowDef(workflowsService);
			const instance = await startedInstance(engine, def.uuid);

			await engine.cancelWorkflow(ownerCtx, instance.uuid);
			const second = await engine.cancelWorkflow(ownerCtx, instance.uuid);

			expect(second.isLeft()).toBe(true);
		});

		it("should reject cancel if the instance is not running (final state reached)", async () => {
			const { engine, workflowsService } = makeHarness();
			const def = await createWorkflowDef(workflowsService);
			const instance = await startedInstance(engine, def.uuid);

			// Transition to final state
			await engine.transition(ownerCtx, instance.uuid, "submit");
			const result = await engine.cancelWorkflow(ownerCtx, instance.uuid);

			expect(result.isLeft()).toBe(true);
		});

		it("should unlock the node when cancelling", async () => {
			const { engine, workflowsService, nodeStub } = makeHarness();
			const def = await createWorkflowDef(workflowsService);
			const instance = await startedInstance(engine, def.uuid);

			await engine.cancelWorkflow(ownerCtx, instance.uuid);

			expect(nodeStub.unlockCalls.length).toBe(1);
			expect(nodeStub.unlockCalls[0]).toBe("node-001");
		});
	});

	describe("findActiveInstances", () => {
		it("should return all active (running) instances", async () => {
			const { engine, workflowsService } = makeHarness();
			const def = await createWorkflowDef(workflowsService);

			const r1 = await engine.startWorkflow(ownerCtx, "node-001", def.uuid);
			expect(r1.isRight()).toBe(true);

			const result = await engine.findActiveInstances(adminCtx);

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				expect(result.value.length).toBe(1);
				expect(result.value[0].nodeUuid).toBe("node-001");
			}
		});

		it("should filter active instances by workflow definition UUID", async () => {
			const repo = new InMemoryConfigurationRepository();
			const workflowsService = new WorkflowsService(repo);
			const instancesService = new WorkflowInstancesService({
				configRepo: repo,
				workflowsService,
			});
			const nodeStub1 = makeNodeServiceStub({ uuid: "node-001" });
			const nodeStub2 = makeNodeServiceStub({ uuid: "node-002" });

			const def1 = await createWorkflowDef(workflowsService);
			const def2 = await createWorkflowDef(workflowsService, { title: "Other Workflow" });

			const engine1 = new WorkflowInstancesEngine({
				configRepo: repo,
				nodeService: nodeStub1.service,
				workflowsService,
				workflowInstancesService: instancesService,
				featuresEngine: makeFeaturesEngineStub().engine,
			});
			const engine2 = new WorkflowInstancesEngine({
				configRepo: repo,
				nodeService: nodeStub2.service,
				workflowsService,
				workflowInstancesService: instancesService,
				featuresEngine: makeFeaturesEngineStub().engine,
			});

			await engine1.startWorkflow(ownerCtx, "node-001", def1.uuid);
			await engine2.startWorkflow(ownerCtx, "node-002", def2.uuid);

			const result = await engine1.findActiveInstances(adminCtx, def1.uuid);

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				expect(result.value.length).toBe(1);
				expect(result.value[0].workflowDefinitionUuid).toBe(def1.uuid);
			}
		});
	});

	describe("updateNode", () => {
		async function startedInstance(engine: WorkflowInstancesEngine, defUuid: string) {
			const r = await engine.startWorkflow(ownerCtx, "node-001", defUuid);
			if (r.isLeft()) throw new Error(`startWorkflow failed: ${r.value.message}`);
			return r.value;
		}

		it("should update the node within workflow context", async () => {
			const { engine, workflowsService, nodeStub } = makeHarness();
			const def = await createWorkflowDef(workflowsService, {
				states: [
					{
						name: "draft",
						isInitial: true,
						groupsAllowedToModify: ["--editors--"],
						transitions: [{ signal: "submit", targetState: "review" }],
					},
					{ name: "review", isFinal: true },
				],
				filters: [],
			});
			const instance = await startedInstance(engine, def.uuid);

			const result = await engine.updateNode(ownerCtx, instance.uuid, { title: "Updated" });

			expect(result.isRight()).toBe(true);
			expect(nodeStub.updateCalls.length).toBeGreaterThan(0);
		});

		it("should reject if user is not in the state's groupsAllowedToModify", async () => {
			const { engine, workflowsService } = makeHarness();
			const def = await createWorkflowDef(workflowsService, {
				states: [
					{
						name: "draft",
						isInitial: true,
						groupsAllowedToModify: ["--editors--"],
						transitions: [{ signal: "submit", targetState: "review" }],
					},
					{ name: "review", isFinal: true },
				],
				filters: [],
			});
			const instance = await startedInstance(engine, def.uuid);

			const result = await engine.updateNode(otherCtx, instance.uuid, { title: "Hacked" });

			expect(result.isLeft()).toBe(true);
		});

		it("should reject if the workflow is cancelled", async () => {
			const { engine, workflowsService } = makeHarness();
			const def = await createWorkflowDef(workflowsService, { filters: [] });
			const instance = await startedInstance(engine, def.uuid);
			await engine.cancelWorkflow(ownerCtx, instance.uuid);

			const result = await engine.updateNode(ownerCtx, instance.uuid, { title: "After cancel" });

			expect(result.isLeft()).toBe(true);
		});

		it("should reject if the workflow is not running (final state)", async () => {
			const { engine, workflowsService } = makeHarness();
			const def = await createWorkflowDef(workflowsService, { filters: [] });
			const instance = await startedInstance(engine, def.uuid);
			await engine.transition(ownerCtx, instance.uuid, "submit");

			const result = await engine.updateNode(ownerCtx, instance.uuid, { title: "After final" });

			expect(result.isLeft()).toBe(true);
		});
	});

	describe("updateNodeFile", () => {
		async function startedInstance(engine: WorkflowInstancesEngine, defUuid: string) {
			const r = await engine.startWorkflow(ownerCtx, "node-001", defUuid);
			if (r.isLeft()) throw new Error(`startWorkflow failed: ${r.value.message}`);
			return r.value;
		}

		it("should update the node file within workflow context", async () => {
			const { engine, workflowsService, nodeStub } = makeHarness();
			const def = await createWorkflowDef(workflowsService, {
				states: [
					{
						name: "draft",
						isInitial: true,
						groupsAllowedToModify: ["--editors--"],
						transitions: [{ signal: "submit", targetState: "review" }],
					},
					{ name: "review", isFinal: true },
				],
				filters: [],
			});
			const instance = await startedInstance(engine, def.uuid);
			const file = new File(["content"], "test.pdf", { type: "application/pdf" });

			const result = await engine.updateNodeFile(ownerCtx, instance.uuid, file);

			expect(result.isRight()).toBe(true);
			expect(nodeStub.updateFileCalls.length).toBe(1);
		});

		it("should reject if user is not in the state's groupsAllowedToModify", async () => {
			const { engine, workflowsService } = makeHarness();
			const def = await createWorkflowDef(workflowsService, {
				states: [
					{
						name: "draft",
						isInitial: true,
						groupsAllowedToModify: ["--editors--"],
						transitions: [{ signal: "submit", targetState: "review" }],
					},
					{ name: "review", isFinal: true },
				],
				filters: [],
			});
			const instance = await startedInstance(engine, def.uuid);
			const file = new File(["content"], "test.pdf", { type: "application/pdf" });

			const result = await engine.updateNodeFile(otherCtx, instance.uuid, file);

			expect(result.isLeft()).toBe(true);
		});
	});
});
