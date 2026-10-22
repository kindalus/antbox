import { describe, it } from "bdd";
import { expect } from "expect";
import { stub } from "mock";
import { InMemoryConfigurationRepository } from "adapters/inmem/inmem_configuration_repository.ts";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository.ts";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider.ts";
import { InMemoryEventBus } from "adapters/inmem/inmem_event_bus.ts";
import { NodeService } from "application/nodes/node_service.ts";
import { FeaturesService } from "application/features/features_service.ts";
import { FeaturesEngine } from "application/features/features_engine.ts";
import type { AuthenticationContext } from "application/security/authentication_context.ts";
import { Groups } from "domain/users_groups/groups.ts";
import { Users } from "domain/users_groups/users.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { WorkflowsService } from "./workflows_service.ts";
import { WorkflowInstancesService } from "./workflow_instances_service.ts";
import { WorkflowInstancesEngine } from "./workflow_instances_engine.ts";
import type { NodeLike } from "domain/node_like.ts";
import { UnknownError } from "shared/antbox_error.ts";
import { left, right } from "shared/either.ts";

class FailingNodeRepository extends InMemoryNodeRepository {
	failUpdateAfter = 0;
	override update(node: NodeLike): ReturnType<InMemoryNodeRepository["update"]> {
		if (this.failUpdateAfter > 0 && --this.failUpdateAfter === 0) {
			return Promise.resolve(left(new UnknownError("Injected persistence failure")));
		}
		return super.update(node);
	}
}

const admin: AuthenticationContext = {
	tenant: "test",
	mode: "Direct",
	principal: { email: Users.ROOT_USER_EMAIL, groups: [Groups.ADMINS_GROUP_UUID] },
};
const editor: AuthenticationContext = {
	...admin,
	principal: { email: "editor@example.com", groups: ["editors"] },
};
const reviewer: AuthenticationContext = {
	...admin,
	principal: { email: "reviewer@example.com", groups: ["reviewers"] },
};

async function harness() {
	const configRepo = new InMemoryConfigurationRepository();
	const repository = new FailingNodeRepository();
	const eventBus = new InMemoryEventBus();
	const nodeService = new NodeService({
		configRepo,
		repository,
		storage: new InMemoryStorageProvider(),
		bus: eventBus,
	});
	const workflowsService = new WorkflowsService(configRepo);
	const workflowInstancesService = new WorkflowInstancesService({ configRepo, workflowsService });
	const featuresEngine = new FeaturesEngine({
		featuresService: new FeaturesService({ configRepo }),
		nodeService,
		eventBus,
	});
	const engine = new WorkflowInstancesEngine({
		configRepo,
		nodeService,
		workflowsService,
		workflowInstancesService,
		featuresEngine,
	});
	const folder = await nodeService.create(admin, {
		uuid: "workflow-folder",
		title: "Workflow folder",
		parent: Nodes.ROOT_FOLDER_UUID,
		mimetype: Nodes.FOLDER_MIMETYPE,
		permissions: {
			group: [],
			authenticated: ["Read", "Write", "Export"],
			anonymous: [],
			advanced: {},
		},
	});
	if (folder.isLeft()) throw folder.value;
	const file = await nodeService.createFile(
		editor,
		new File(["test"], "test.txt", {
			type: "text/plain",
		}),
		{ uuid: "workflow-file", parent: folder.value.uuid },
	);
	if (file.isLeft()) throw file.value;
	const workflow = await workflowsService.createWorkflow(admin, {
		title: "Approval workflow",
		states: [
			{
				name: "draft",
				isInitial: true,
				transitions: [{ signal: "finish", targetState: "done" }],
			},
			{ name: "done", isFinal: true },
		],
		availableStateNames: ["draft", "done"],
		filters: [],
		participants: ["editors", "reviewers"],
	});
	if (workflow.isLeft()) throw workflow.value;
	return {
		engine,
		featuresEngine,
		nodeService,
		workflowInstancesService,
		configRepo,
		repository,
		file: file.value,
		workflow: workflow.value,
	};
}

describe("WorkflowInstancesEngine integration", () => {
	for (const operation of ["cancel", "update"] as const) {
		it(`allows ${operation} of legacy workflow locks restricted to the initiating group`, async () => {
			const { engine, repository, nodeService, file, workflow } = await harness();
			const started = await engine.startWorkflow(editor, file.uuid, workflow.uuid);
			if (started.isLeft()) throw started.value;
			// Persisted workflows from earlier versions used the caller's groups for this lock.
			const legacy = (await repository.getById(file.uuid)).right;
			expect(legacy.update({ unlockAuthorizedGroups: ["editors"] }).isRight()).toBe(true);
			expect((await repository.update(legacy)).isRight()).toBe(true);
			for (const caller of [editor, admin]) {
				expect((await nodeService.unlock(caller, file.uuid)).isLeft()).toBe(true);
			}

			const result = operation === "cancel"
				? await engine.cancelWorkflow(editor, started.value.uuid)
				: await engine.updateNode(editor, started.value.uuid, {
					title: "Legacy review updated",
				});

			if (result.isLeft()) throw result.value;
			const node = (await nodeService.get(editor, file.uuid)).right;
			if (operation === "cancel") {
				expect(node.locked).toBe(false);
				expect(node.workflowInstanceUuid).toBeUndefined();
			} else {
				expect(node.title).toBe("Legacy review updated");
				expect(node.locked).toBe(true);
				expect(node.unlockAuthorizedGroups).toEqual(["editors"]);
				expect(node.workflowInstanceUuid).toBe(started.value.uuid);
			}
		});
	}

	it("keeps the parent-unlock requirement for legacy workflow nodes owned by the lock system", async () => {
		const { engine, repository, nodeService, file, workflow } = await harness();
		const started = await engine.startWorkflow(editor, file.uuid, workflow.uuid);
		if (started.isLeft()) throw started.value;
		const legacy = (await repository.getById(file.uuid)).right;
		legacy.update({
			lockedBy: Users.LOCK_SYSTEM_USER_EMAIL,
			unlockAuthorizedGroups: ["editors"],
		});
		await repository.update(legacy);

		const result = await engine.cancelWorkflow(editor, started.value.uuid);

		expect(result.isLeft()).toBe(true);
		expect(result.isLeft() && result.value.message).toContain("Unlock the parent folder instead");
		const retained = (await nodeService.get(editor, file.uuid)).right;
		expect(retained.locked).toBe(true);
		expect(retained.workflowInstanceUuid).toBe(started.value.uuid);
	});

	it("does not make a restricted workflow public with an empty participant override", async () => {
		const { engine, nodeService, file, workflow } = await harness();
		const started = await engine.startWorkflow(editor, file.uuid, workflow.uuid, []);
		expect(started.isLeft()).toBe(true);
		expect((await nodeService.get(editor, file.uuid)).right.locked).toBe(false);
	});

	it("preserves workflow and lock state when participants edit node metadata", async () => {
		const { engine, nodeService, file, workflow } = await harness();
		const started = await engine.startWorkflow(editor, file.uuid, workflow.uuid);
		if (started.isLeft()) throw started.value;
		const updated = await engine.updateNode(editor, started.value.uuid, {
			title: "Reviewed",
			workflowInstanceUuid: "unrelated-workflow",
			workflowState: "done",
			locked: false,
			lockedBy: "someone@example.com",
			unlockAuthorizedGroups: ["reviewers"],
			parent: Nodes.ROOT_FOLDER_UUID,
			permissions: { group: [], authenticated: [], anonymous: ["Write"], advanced: {} },
			onUpdate: ["untrusted-feature"],
		});
		if (updated.isLeft()) throw updated.value;
		const node = (await nodeService.get(editor, file.uuid)).right;
		expect(node.title).toBe("Reviewed");
		expect(node.workflowInstanceUuid).toBe(started.value.uuid);
		expect(node.workflowState).toBe("draft");
		expect(node.locked).toBe(true);
		expect(node.lockedBy).toBe(editor.principal.email);
		expect(node.unlockAuthorizedGroups).toEqual([Groups.ADMINS_GROUP_UUID]);
		expect(node.parent).toBe(file.parent);
		expect(node.permissions).toEqual(file.permissions);
		expect(node.onUpdate).toEqual(file.onUpdate);
	});

	it("stores the canonical node UUID when started through a friendly identifier", async () => {
		const { engine, file, workflow } = await harness();
		const started = await engine.startWorkflow(editor, Nodes.fidToUuid(file.fid), workflow.uuid);
		if (started.isLeft()) throw started.value;
		expect(started.value.nodeUuid).toBe(file.uuid);
	});

	it("allows only one concurrent workflow start for the same node", async () => {
		const { engine, configRepo, file, workflow } = await harness();
		const results = await Promise.all([
			engine.startWorkflow(editor, file.uuid, workflow.uuid),
			engine.startWorkflow(editor, Nodes.fidToUuid(file.fid), workflow.uuid),
		]);
		expect(results.filter((result) => result.isRight()).length).toBe(1);
		expect((await configRepo.list("workflowInstances")).right.length).toBe(1);
	});

	it("stops before locking when the active-instance lookup fails", async () => {
		const { engine, configRepo, nodeService, file, workflow } = await harness();
		const failure = new UnknownError("Configuration database unavailable");
		configRepo.list = () => Promise.resolve(left(failure));
		const started = await engine.startWorkflow(editor, file.uuid, workflow.uuid);
		expect(started.value).toBe(failure);
		expect((await nodeService.get(editor, file.uuid)).right.locked).toBe(false);
	});

	it("executes a concurrent transition once and rejects transitions from a completed instance", async () => {
		const { engine, configRepo, featuresEngine, file, workflow } = await harness();
		await configRepo.save("workflows", {
			...workflow,
			states: [
				{ ...workflow.states[0], onExit: ["count-action"] },
				{ ...workflow.states[1], transitions: [{ signal: "reopen", targetState: "draft" }] },
			],
		});
		let actionCalls = 0;
		featuresEngine.runAction = <T>() => {
			actionCalls++;
			return Promise.resolve(right(undefined as T));
		};
		const started = await engine.startWorkflow(editor, file.uuid, workflow.uuid);
		if (started.isLeft()) throw started.value;
		const results = await Promise.all([
			engine.transition(editor, started.value.uuid, "finish"),
			engine.transition(reviewer, started.value.uuid, "finish"),
		]);
		expect(results.filter((result) => result.isRight()).length).toBe(1);
		expect(actionCalls).toBe(1);
		expect((await engine.transition(editor, started.value.uuid, "reopen")).isLeft()).toBe(true);
		const stored = (await configRepo.get("workflowInstances", started.value.uuid)).right;
		expect(stored.currentStateName).toBe("done");
		expect(stored.history?.length).toBe(1);
	});

	it("keeps failed completion and cancellation recoverable after node persistence errors", async () => {
		for (const operation of ["finish", "cancel"] as const) {
			for (const failUpdateAfter of [1, 2]) {
				const { engine, repository, configRepo, nodeService, file, workflow } = await harness();
				const started = await engine.startWorkflow(editor, file.uuid, workflow.uuid);
				if (started.isLeft()) throw started.value;
				const complete = () =>
					operation === "finish"
						? engine.transition(editor, started.value.uuid, "finish")
						: engine.cancelWorkflow(editor, started.value.uuid);
				repository.failUpdateAfter = failUpdateAfter;
				expect((await complete()).isLeft()).toBe(true);
				const retained = (await configRepo.get("workflowInstances", started.value.uuid)).right;
				expect(retained.running).toBe(true);
				expect(retained.currentStateName).toBe("draft");
				expect(retained.cancelled).toBe(false);
				const retried = await complete();
				if (retried.isLeft()) throw retried.value;
				expect(retried.value.running).toBe(false);
				const node = (await nodeService.get(editor, file.uuid)).right;
				expect(node.workflowInstanceUuid).toBeUndefined();
				expect(node.locked).toBe(false);
			}
		}
	});

	it("rejects direct locking after workflow cancellation fails to clear its binding", async () => {
		const { engine, repository, nodeService, file, workflow } = await harness();
		const started = await engine.startWorkflow(editor, file.uuid, workflow.uuid);
		if (started.isLeft()) throw started.value;
		repository.failUpdateAfter = 2;
		expect((await engine.cancelWorkflow(editor, started.value.uuid)).isLeft()).toBe(true);
		const retained = (await nodeService.get(editor, file.uuid)).right;
		expect(retained.locked).toBe(false);
		expect(retained.workflowInstanceUuid).toBe(started.value.uuid);

		expect((await nodeService.lock(reviewer, file.uuid)).isLeft()).toBe(true);
		const retried = await engine.cancelWorkflow(editor, started.value.uuid);
		if (retried.isLeft()) throw retried.value;
		expect(retried.value.cancelled).toBe(true);
		const released = (await nodeService.get(editor, file.uuid)).right;
		expect(released.locked).toBe(false);
		expect(released.workflowInstanceUuid).toBeUndefined();
	});

	it("preserves workflow ownership when a parent is locked after failed cancellation", async () => {
		const { engine, repository, nodeService, file, workflow } = await harness();
		const started = await engine.startWorkflow(editor, file.uuid, workflow.uuid);
		if (started.isLeft()) throw started.value;
		repository.failUpdateAfter = 2;
		expect((await engine.cancelWorkflow(editor, started.value.uuid)).isLeft()).toBe(true);

		const locked = await nodeService.lock(admin, file.parent);
		if (locked.isLeft()) throw locked.value;
		expect((await nodeService.get(admin, file.parent)).right.locked).toBe(true);
		const retained = (await nodeService.get(editor, file.uuid)).right;
		expect(retained.locked).toBe(false);
		expect(retained.workflowInstanceUuid).toBe(started.value.uuid);

		const retried = await engine.cancelWorkflow(editor, started.value.uuid);
		if (retried.isLeft()) throw retried.value;
		expect(retried.value.cancelled).toBe(true);
		const unlocked = await nodeService.unlock(admin, file.parent);
		if (unlocked.isLeft()) throw unlocked.value;
		expect((await nodeService.get(admin, file.parent)).right.locked).toBe(false);
		const released = (await nodeService.get(editor, file.uuid)).right;
		expect(released.locked).toBe(false);
		expect(released.workflowInstanceUuid).toBeUndefined();
	});

	it("serializes legacy snapshot backfills with transitions", async () => {
		const { engine, configRepo, file, workflow } = await harness();
		const started = await engine.startWorkflow(editor, file.uuid, workflow.uuid);
		if (started.isLeft()) throw started.value;
		const legacy = { ...started.value };
		Reflect.deleteProperty(legacy, "workflowDefinition");
		await configRepo.save("workflowInstances", legacy);

		const firstFinished = Promise.withResolvers<void>();
		const original = WorkflowsService.prototype.getWorkflow;
		let lookupCount = 0;
		const getWorkflow = stub(
			WorkflowsService.prototype,
			"getWorkflow",
			async function (this: WorkflowsService, ctx: AuthenticationContext, uuid: string) {
				const result = await original.call(this, ctx, uuid);
				if (++lookupCount === 2) await firstFinished.promise;
				return result;
			},
		);
		try {
			const first = engine.transition(editor, started.value.uuid, "finish");
			const second = engine.transition(reviewer, started.value.uuid, "finish");
			const firstResult = await first;
			firstFinished.resolve();
			const results = [firstResult, await second];
			expect(results.filter((result) => result.isRight())).toHaveLength(1);
			expect((await configRepo.get("workflowInstances", started.value.uuid)).right.running)
				.toBe(false);
		} finally {
			firstFinished.resolve();
			getWorkflow.restore();
		}
	});

	it("returns legacy snapshots without overwriting stored instance state on reads", async () => {
		const { engine, workflowInstancesService, configRepo, file, workflow } = await harness();
		const started = await engine.startWorkflow(editor, file.uuid, workflow.uuid);
		if (started.isLeft()) throw started.value;
		const legacy = { ...started.value };
		Reflect.deleteProperty(legacy, "workflowDefinition");
		await configRepo.save("workflowInstances", legacy);
		const viewed = await workflowInstancesService.getWorkflowInstance(editor, legacy.uuid);
		if (viewed.isLeft()) throw viewed.value;
		expect(viewed.value.workflowDefinition.uuid).toBe(workflow.uuid);
		expect((await configRepo.get("workflowInstances", legacy.uuid)).right).toEqual(legacy);
	});

	it("does not replace a workflow binding while its node is unlocked", async () => {
		const { engine, configRepo, nodeService, file, workflow } = await harness();
		const started = await engine.startWorkflow(editor, file.uuid, workflow.uuid);
		if (started.isLeft()) throw started.value;
		await configRepo.save("workflowInstances", {
			...started.value,
			nodeUuid: Nodes.fidToUuid(file.fid),
		});
		const unlocked = await nodeService.unlock({
			...admin,
			principal: { ...admin.principal, email: Users.WORKFLOW_INSTANCE_USER_EMAIL },
		}, file.uuid);
		if (unlocked.isLeft()) throw unlocked.value;
		expect((await engine.startWorkflow(editor, file.uuid, workflow.uuid)).isLeft()).toBe(true);
		expect((await nodeService.get(editor, file.uuid)).right.workflowInstanceUuid)
			.toBe(started.value.uuid);
	});

	it("queues starts behind a legacy workflow that stores a friendly node identifier", async () => {
		const { engine, featuresEngine, configRepo, nodeService, file, workflow } = await harness();
		await configRepo.save("workflows", {
			...workflow,
			states: [{ ...workflow.states[0], onExit: ["hold-action"] }, workflow.states[1]],
		});
		const started = await engine.startWorkflow(editor, file.uuid, workflow.uuid);
		if (started.isLeft()) throw started.value;
		await configRepo.save("workflowInstances", {
			...started.value,
			nodeUuid: Nodes.fidToUuid(file.fid),
		});
		const actionStarted = Promise.withResolvers<void>();
		const releaseAction = Promise.withResolvers<void>();
		featuresEngine.runAction = async <T>() => {
			actionStarted.resolve();
			await releaseAction.promise;
			return right(undefined as T);
		};
		try {
			const finishing = engine.transition(editor, started.value.uuid, "finish");
			await actionStarted.promise;
			const starting = engine.startWorkflow(editor, file.uuid, workflow.uuid);
			// Allow the second call's in-memory reads to finish while the transition is held.
			await new Promise((resolve) => setTimeout(resolve, 0));
			releaseAction.resolve();
			const completed = await finishing;
			if (completed.isLeft()) throw completed.value;
			expect(completed.value.nodeUuid).toBe(file.uuid);
			const next = await starting;
			if (next.isLeft()) throw next.value;
			expect((await nodeService.get(editor, file.uuid)).right.workflowInstanceUuid)
				.toBe(next.value.uuid);
		} finally {
			releaseAction.resolve();
		}
	});

	it("keeps legacy workflows usable after their node's friendly identifier changes", async () => {
		for (const operation of ["finish", "cancel"] as const) {
			const { engine, configRepo, nodeService, file, workflow } = await harness();
			const started = await engine.startWorkflow(editor, file.uuid, workflow.uuid);
			if (started.isLeft()) throw started.value;
			await configRepo.save("workflowInstances", {
				...started.value,
				nodeUuid: Nodes.fidToUuid(file.fid),
			});
			const renamed = await engine.updateNode(editor, started.value.uuid, { fid: "renamed" });
			if (renamed.isLeft()) throw renamed.value;
			expect((await configRepo.get("workflowInstances", started.value.uuid)).right.nodeUuid)
				.toBe(file.uuid);
			const finished = operation === "finish"
				? await engine.transition(editor, started.value.uuid, "finish")
				: await engine.cancelWorkflow(editor, started.value.uuid);
			if (finished.isLeft()) throw finished.value;
			expect(finished.value.nodeUuid).toBe(file.uuid);
			expect((await nodeService.get(editor, file.uuid)).right.locked).toBe(false);
		}
	});

	it("preserves the node when canonical legacy identity cannot be saved", async () => {
		const { engine, configRepo, nodeService, file, workflow } = await harness();
		const started = await engine.startWorkflow(editor, file.uuid, workflow.uuid);
		if (started.isLeft()) throw started.value;
		const legacy = { ...started.value, nodeUuid: Nodes.fidToUuid(file.fid) };
		await configRepo.save("workflowInstances", legacy);
		const save = stub(
			configRepo,
			"save",
			() => Promise.resolve(left(new UnknownError("Injected canonicalization failure"))),
		);
		try {
			expect((await engine.updateNode(editor, started.value.uuid, { fid: "renamed" })).isLeft())
				.toBe(true);
			expect((await nodeService.get(editor, file.uuid)).right.fid).toBe(file.fid);
			expect((await configRepo.get("workflowInstances", started.value.uuid)).right).toEqual(
				legacy,
			);
		} finally {
			save.restore();
		}
	});

	it("does not persist a canonical legacy identity before modification authorization", async () => {
		const { engine, configRepo, nodeService, file, workflow } = await harness();
		await configRepo.save("workflows", {
			...workflow,
			states: [
				{ ...workflow.states[0], groupsAllowedToModify: ["editors"] },
				workflow.states[1],
			],
		});
		const started = await engine.startWorkflow(editor, file.uuid, workflow.uuid);
		if (started.isLeft()) throw started.value;
		const legacy = { ...started.value, nodeUuid: Nodes.fidToUuid(file.fid) };
		await configRepo.save("workflowInstances", legacy);
		expect((await engine.updateNode(reviewer, started.value.uuid, { fid: "renamed" })).isLeft())
			.toBe(true);
		expect((await configRepo.get("workflowInstances", started.value.uuid)).right).toEqual(legacy);
		expect((await nodeService.get(editor, file.uuid)).right.fid).toBe(file.fid);
	});

	it("preserves a canonical reference before a legacy transition action renames the node", async () => {
		const { engine, featuresEngine, configRepo, nodeService, file, workflow } = await harness();
		await configRepo.save("workflows", {
			...workflow,
			states: [{ ...workflow.states[0], onExit: ["rename-action"] }, workflow.states[1]],
		});
		const started = await engine.startWorkflow(editor, file.uuid, workflow.uuid);
		if (started.isLeft()) throw started.value;
		await configRepo.save("workflowInstances", {
			...started.value,
			nodeUuid: Nodes.fidToUuid(file.fid),
		});
		featuresEngine.runAction = async <T>() => {
			expect((await configRepo.get("workflowInstances", started.value.uuid)).right.nodeUuid)
				.toBe(file.uuid);
			const renamed = await nodeService.update(
				{
					...admin,
					principal: { ...admin.principal, email: Users.WORKFLOW_INSTANCE_USER_EMAIL },
				},
				file.uuid,
				{ fid: "action-renamed" },
			);
			if (renamed.isLeft()) throw renamed.value;
			return right(undefined as T);
		};
		const finished = await engine.transition(editor, started.value.uuid, "finish");
		if (finished.isLeft()) throw finished.value;
		expect(finished.value.nodeUuid).toBe(file.uuid);
		expect((await nodeService.get(editor, file.uuid)).right.fid).toBe("action-renamed");
	});

	it("requires cancellation or completion before deleting a running instance", async () => {
		const { engine, workflowInstancesService, nodeService, file, workflow } = await harness();
		const started = await engine.startWorkflow(editor, file.uuid, workflow.uuid);
		if (started.isLeft()) throw started.value;
		const deleted = await workflowInstancesService.deleteWorkflowInstance(
			admin,
			started.value.uuid,
		);
		expect(deleted.isLeft()).toBe(true);
		const cancelled = await engine.cancelWorkflow(editor, started.value.uuid);
		if (cancelled.isLeft()) throw cancelled.value;
		expect((await nodeService.get(editor, file.uuid)).right.locked).toBe(false);
		expect(
			(await workflowInstancesService.deleteWorkflowInstance(admin, started.value.uuid))
				.isRight(),
		)
			.toBe(true);
	});

	it("allows a non-admin to start and a different participant to complete a workflow", async () => {
		const { engine, nodeService, file, workflow } = await harness();
		const started = await engine.startWorkflow(editor, file.uuid, workflow.uuid);
		if (started.isLeft()) throw started.value;
		expect((await nodeService.get(editor, file.uuid)).right.workflowInstanceUuid)
			.toBe(started.value.uuid);
		const updated = await engine.updateNode(editor, started.value.uuid, { title: "Reviewed" });
		if (updated.isLeft()) throw updated.value;
		const completed = await engine.transition(reviewer, started.value.uuid, "finish");
		if (completed.isLeft()) throw completed.value;
		expect(completed.value.running).toBe(false);
		const node = (await nodeService.get(editor, file.uuid)).right;
		expect(node.title).toBe("Reviewed");
		expect(node.locked).toBe(false);
		expect(node.workflowInstanceUuid).toBeUndefined();
	});
});
