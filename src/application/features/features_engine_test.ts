import { describe, it } from "bdd";
import { expect } from "expect";
import { InMemoryConfigurationRepository } from "adapters/inmem/inmem_configuration_repository.ts";
import { InMemoryEventBus } from "adapters/inmem/inmem_event_bus.ts";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository.ts";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider.ts";
import { NullOCRProvider } from "adapters/ocr/null_ocr_provider.ts";
import type { FeatureData } from "domain/configuration/feature_data.ts";
import type { NodeMetadata } from "domain/nodes/node_metadata.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { Groups } from "domain/users_groups/groups.ts";
import { Users } from "domain/users_groups/users.ts";
import { BadRequestError } from "shared/antbox_error.ts";
import type { AuthenticationContext } from "application/security/authentication_context.ts";
import { NodeService } from "application/nodes/node_service.ts";
import { FeaturesEngine } from "./features_engine.ts";
import { FeaturesService } from "./features_service.ts";

interface Harness {
	nodeService: NodeService;
	featuresService: FeaturesService;
	engine: FeaturesEngine;
}

const adminCtx: AuthenticationContext = {
	tenant: "test",
	mode: "Direct",
	principal: {
		email: Users.ROOT_USER_EMAIL,
		groups: [Groups.ADMINS_GROUP_UUID],
	},
};

function createHarness(useOCR = false): Harness {
	const configRepo = new InMemoryConfigurationRepository();
	const eventBus = new InMemoryEventBus();
	const nodeService = new NodeService({
		repository: new InMemoryNodeRepository(),
		storage: new InMemoryStorageProvider(),
		bus: eventBus,
		configRepo,
	});
	const featuresService = new FeaturesService({ configRepo });
	const engine = new FeaturesEngine({
		featuresService,
		nodeService,
		ocrProvider: useOCR ? new NullOCRProvider() : undefined,
		eventBus,
	});

	return { nodeService, featuresService, engine };
}

function createFeatureRun(
	opts: {
		exposeAction?: boolean;
		runOnCreates?: boolean;
		runManually?: boolean;
		exposeExtension?: boolean;
		exposeAITool?: boolean;
		filters?: unknown[];
		returnType?: string;
		runBody?: string;
	} = {},
): string {
	const { runBody = "return args;" } = opts;

	return `async function(ctx, args) {
		${runBody}
	}`;
}

let featureCounter = 0;

const defaultActionParameters: FeatureData["parameters"] = [
	{
		name: "uuids",
		type: "array",
		arrayType: "string",
		required: true,
		description: "Node UUIDs",
	},
];

function createFeatureInput(
	overrides: Partial<Omit<FeatureData, "uuid" | "createdTime" | "modifiedTime">>,
) {
	featureCounter += 1;
	const parameters = overrides.parameters ??
		(overrides.exposeAction === false ? [] : defaultActionParameters);

	return {
		uuid: `engine_feature_${featureCounter}`,
		title: "Test Feature",
		description: "Feature used in tests",
		exposeAction: true,
		runOnCreates: false,
		runOnUpdates: false,
		runOnDeletes: false,
		runManually: true,
		filters: [],
		exposeExtension: false,
		exposeAITool: false,
		runAs: undefined,
		groupsAllowed: [],
		parameters,
		returnType: "object" as const,
		returnDescription: "Returns test data",
		returnContentType: "application/json",
		tags: ["test"],
		run: createFeatureRun(),
		...overrides,
	};
}

async function createFeature(
	harness: Harness,
	overrides: Partial<Omit<FeatureData, "uuid" | "createdTime" | "modifiedTime">>,
): Promise<string> {
	const featureOrErr = await harness.featuresService.createFeature(
		adminCtx,
		createFeatureInput(overrides),
	);

	expect(featureOrErr.isRight()).toBe(true);
	if (featureOrErr.isLeft()) {
		throw featureOrErr.value;
	}

	return featureOrErr.value.uuid;
}

async function waitFor(condition: () => Promise<boolean>, timeoutMs = 1000): Promise<boolean> {
	const startedAt = Date.now();

	while (Date.now() - startedAt < timeoutMs) {
		if (await condition()) {
			return true;
		}

		await new Promise((resolve) => setTimeout(resolve, 20));
	}

	return false;
}

describe("FeaturesEngine", () => {
	it("runAction executes feature and filters uuids by feature filters", async () => {
		const harness = createHarness();

		await harness.nodeService.create(adminCtx, {
			uuid: "features-folder",
			title: "Features Folder",
			mimetype: Nodes.FOLDER_MIMETYPE,
			parent: Nodes.ROOT_FOLDER_UUID,
		});

		await harness.nodeService.createFile(
			adminCtx,
			new File(["allowed content"], "allowed.txt", { type: "text/plain" }),
			{
				uuid: "allowed-file",
				title: "allowed.txt",
				mimetype: "text/plain",
				parent: "features-folder",
			},
		);

		await harness.nodeService.createFile(
			adminCtx,
			new File(["blocked content"], "blocked.jpg", { type: "image/jpeg" }),
			{
				uuid: "blocked-file",
				title: "blocked.jpg",
				mimetype: "image/jpeg",
				parent: "features-folder",
			},
		);

		const featureUuid = await createFeature(harness, {
			filters: [["mimetype", "==", "text/plain"]],
			run: createFeatureRun({
				filters: [["mimetype", "==", "text/plain"]],
				runBody: "return { uuids: args.uuids };",
			}),
		});

		const result = await harness.engine.runAction<{ uuids: string[] }>(
			adminCtx,
			featureUuid,
			["allowed-file", "blocked-file"],
		);

		expect(result.isRight()).toBe(true);
		if (result.isRight()) {
			expect(result.value.uuids).toEqual(["allowed-file"]);
		}
	});

	it("runAction rejects features not exposed as action", async () => {
		const harness = createHarness();
		const featureUuid = await createFeature(harness, {
			exposeAction: false,
			exposeAITool: true,
			run: createFeatureRun({
				exposeAction: false,
				exposeAITool: true,
			}),
		});

		const result = await harness.engine.runAction(adminCtx, featureUuid, []);

		expect(result.isLeft()).toBe(true);
		if (result.isLeft()) {
			expect(result.value).toBeInstanceOf(BadRequestError);
			expect(result.value.message).toContain("not exposed as action");
		}
	});

	it("runAITool routes built-in NodeService methods", async () => {
		const harness = createHarness();

		await harness.nodeService.create(adminCtx, {
			uuid: "tool-folder",
			title: "Tool Folder",
			mimetype: Nodes.FOLDER_MIMETYPE,
			parent: Nodes.ROOT_FOLDER_UUID,
		});

		const result = await harness.engine.runAITool<NodeMetadata[]>(adminCtx, "NodeService:list", {
			parent: Nodes.ROOT_FOLDER_UUID,
		});

		expect(result.isRight()).toBe(true);
		if (result.isRight()) {
			expect(result.value.some((node) => node.uuid === "tool-folder")).toBe(true);
		}
	});

	it("runAITool returns export error for OcrModel when node is missing", async () => {
		const harness = createHarness(true);

		const result = await harness.engine.runAITool<string>(adminCtx, "OcrModel:ocr", {
			uuid: "missing-node",
		});

		expect(result.isLeft()).toBe(true);
		if (result.isLeft()) {
			expect(result.value.message).toContain("missing-node");
		}
	});

	it("runExtension executes extension features and returns JSON payload", async () => {
		const harness = createHarness();

		const featureUuid = await createFeature(harness, {
			exposeAction: false,
			exposeExtension: true,
			returnType: "object",
			run: createFeatureRun({
				exposeAction: false,
				exposeExtension: true,
				returnType: "object",
				runBody: "return { ok: true, value: args.value ?? null };",
			}),
		});

		const request = new Request("http://localhost/v2/extensions/test", {
			method: "POST",
			headers: new Headers({
				"content-type": "application/json",
			}),
			body: JSON.stringify({ value: "hello" }),
		});

		const response = await harness.engine.runExtension(adminCtx, featureUuid, request);

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toContain("application/json");

		const payload = await response.json() as { ok: boolean; value: string };
		expect(payload).toEqual({ ok: true, value: "hello" });
	});

	it("exposes ctx.logger to features", async () => {
		const harness = createHarness();
		const originalInfo = console.info;
		const logged: unknown[][] = [];
		console.info = (...args: unknown[]) => {
			logged.push(args);
		};

		try {
			await harness.nodeService.create(adminCtx, {
				uuid: "logger-folder",
				title: "Logger Folder",
				mimetype: Nodes.FOLDER_MIMETYPE,
				parent: Nodes.ROOT_FOLDER_UUID,
			});

			await harness.nodeService.createFile(
				adminCtx,
				new File(["logger body"], "logger.txt", { type: "text/plain" }),
				{
					uuid: "logger-file",
					title: "logger.txt",
					mimetype: "text/plain",
					parent: "logger-folder",
				},
			);

			const featureUuid = await createFeature(harness, {
				run: createFeatureRun({
					runBody: `
						ctx.logger.info("feature log", args.uuids);
						return { ok: true };
					`,
				}),
			});

			const result = await harness.engine.runAction<{ ok: boolean }>(
				adminCtx,
				featureUuid,
				["logger-file"],
			);

			expect(result.isRight()).toBe(true);
			expect(logged).toHaveLength(1);
			expect(logged[0][0]).toBe("[INFO]");
			expect(logged[0][1]).toBe(`[feature=${featureUuid}] [tenant=test]`);
			expect(logged[0][2]).toBe("feature log");
		} finally {
			console.info = originalInfo;
		}
	});

	it("runs automatic onCreate actions when a node is created", async () => {
		const harness = createHarness();

		await harness.nodeService.create(adminCtx, {
			uuid: "auto-folder",
			title: "Auto Folder",
			mimetype: Nodes.FOLDER_MIMETYPE,
			parent: Nodes.ROOT_FOLDER_UUID,
		});

		await createFeature(harness, {
			runOnCreates: true,
			runManually: false,
			run: createFeatureRun({
				runOnCreates: true,
				runManually: false,
				runBody: `
					if (Array.isArray(args.uuids) && args.uuids.length > 0) {
						await ctx.nodeService.update(args.uuids[0], {
							description: "triggered-by-onCreate",
						});
					}
					return { done: true };
				`,
			}),
		});

		await harness.nodeService.createFile(
			adminCtx,
			new File(["auto body"], "auto.txt", { type: "text/plain" }),
			{
				uuid: "auto-file",
				title: "auto.txt",
				mimetype: "text/plain",
				parent: "auto-folder",
			},
		);

		const updated = await waitFor(async () => {
			const nodeOrErr = await harness.nodeService.get(adminCtx, "auto-file");
			return nodeOrErr.isRight() && nodeOrErr.value.description === "triggered-by-onCreate";
		}, 1200);

		expect(updated).toBe(true);
	});

	it("runs automatic onCreate actions through the action pipeline", async () => {
		const harness = createHarness();

		await harness.nodeService.create(adminCtx, {
			uuid: "auto-pipeline-folder",
			title: "Auto Pipeline Folder",
			mimetype: Nodes.FOLDER_MIMETYPE,
			parent: Nodes.ROOT_FOLDER_UUID,
		});

		await createFeature(harness, {
			runOnCreates: true,
			runManually: false,
			runAs: "--reviewers--",
			run: createFeatureRun({
				runOnCreates: true,
				runManually: false,
				runBody: `
					if (!ctx.authenticationContext.principal.groups.includes("--reviewers--")) {
						throw new Error("missing runAs group");
					}

					if (Array.isArray(args.uuids) && args.uuids.length > 0) {
						await ctx.nodeService.update(args.uuids[0], {
							description: "triggered-via-runAction",
						});
					}

					return { done: true };
				`,
			}),
		});

		await harness.nodeService.createFile(
			adminCtx,
			new File(["auto pipeline body"], "auto-pipeline.txt", { type: "text/plain" }),
			{
				uuid: "auto-pipeline-file",
				title: "auto-pipeline.txt",
				mimetype: "text/plain",
				parent: "auto-pipeline-folder",
			},
		);

		const updated = await waitFor(async () => {
			const nodeOrErr = await harness.nodeService.get(adminCtx, "auto-pipeline-file");
			return nodeOrErr.isRight() && nodeOrErr.value.description === "triggered-via-runAction";
		}, 1200);

		expect(updated).toBe(true);
	});

	it("runs automatic onUpdate actions through the action pipeline", async () => {
		const harness = createHarness();

		await harness.nodeService.create(adminCtx, {
			uuid: "auto-update-folder",
			title: "Auto Update Folder",
			mimetype: Nodes.FOLDER_MIMETYPE,
			parent: Nodes.ROOT_FOLDER_UUID,
		});

		await harness.nodeService.create(adminCtx, {
			uuid: "auto-update-target",
			title: "Auto Update Target",
			mimetype: Nodes.FOLDER_MIMETYPE,
			parent: Nodes.ROOT_FOLDER_UUID,
		});

		await harness.nodeService.createFile(
			adminCtx,
			new File(["update body"], "update.txt", { type: "text/plain" }),
			{
				uuid: "auto-update-file",
				title: "update.txt",
				mimetype: "text/plain",
				parent: "auto-update-folder",
			},
		);

		await createFeature(harness, {
			filters: [["uuid", "==", "auto-update-file"]],
			runOnUpdates: true,
			runManually: false,
			runAs: "--reviewers--",
			run: createFeatureRun({
				runBody: `
					if (!ctx.authenticationContext.principal.groups.includes("--reviewers--")) {
						throw new Error("missing runAs group");
					}

					await ctx.nodeService.update("auto-update-target", {
						description: Array.isArray(args.uuids) ? args.uuids.join(",") : "missing-uuids",
					});

					return { done: true };
				`,
			}),
		});

		await harness.nodeService.update(adminCtx, "auto-update-file", {
			description: "updated-source-node",
		});

		const updated = await waitFor(async () => {
			const nodeOrErr = await harness.nodeService.get(adminCtx, "auto-update-target");
			return nodeOrErr.isRight() && nodeOrErr.value.description === "auto-update-file";
		}, 1200);

		expect(updated).toBe(true);
	});

	it("runs automatic onDelete actions through the action pipeline", async () => {
		const harness = createHarness();

		await harness.nodeService.create(adminCtx, {
			uuid: "auto-delete-folder",
			title: "Auto Delete Folder",
			mimetype: Nodes.FOLDER_MIMETYPE,
			parent: Nodes.ROOT_FOLDER_UUID,
		});

		await harness.nodeService.create(adminCtx, {
			uuid: "auto-delete-target",
			title: "Auto Delete Target",
			mimetype: Nodes.FOLDER_MIMETYPE,
			parent: Nodes.ROOT_FOLDER_UUID,
		});

		await harness.nodeService.createFile(
			adminCtx,
			new File(["delete body"], "delete.txt", { type: "text/plain" }),
			{
				uuid: "auto-delete-file",
				title: "delete.txt",
				mimetype: "text/plain",
				parent: "auto-delete-folder",
			},
		);

		await createFeature(harness, {
			runOnDeletes: true,
			runManually: false,
			runAs: "--reviewers--",
			run: createFeatureRun({
				runBody: `
					if (!ctx.authenticationContext.principal.groups.includes("--reviewers--")) {
						throw new Error("missing runAs group");
					}

					await ctx.nodeService.update("auto-delete-target", {
						description: Array.isArray(args.uuids) ? args.uuids.join(",") : "missing-uuids",
					});

					return { done: true };
				`,
			}),
		});

		await harness.nodeService.delete(adminCtx, "auto-delete-file");

		const updated = await waitFor(async () => {
			const nodeOrErr = await harness.nodeService.get(adminCtx, "auto-delete-target");
			return nodeOrErr.isRight() && nodeOrErr.value.description === "auto-delete-file";
		}, 1200);

		expect(updated).toBe(true);
	});

	it("does not run non-action features from folder onCreate hooks", async () => {
		const harness = createHarness();

		const featureUuid = await createFeature(harness, {
			exposeAction: false,
			exposeExtension: true,
			run: createFeatureRun({
				runBody: `
					if (Array.isArray(args.uuids) && args.uuids.length > 0) {
						await ctx.nodeService.update(args.uuids[0], {
							description: "should-not-run",
						});
					}
					return { done: true };
				`,
			}),
		});

		await harness.nodeService.create(adminCtx, {
			uuid: "hook-folder",
			title: "Hook Folder",
			mimetype: Nodes.FOLDER_MIMETYPE,
			parent: Nodes.ROOT_FOLDER_UUID,
			onCreate: [featureUuid],
		});

		await harness.nodeService.createFile(
			adminCtx,
			new File(["hook body"], "hook.txt", { type: "text/plain" }),
			{
				uuid: "hook-file",
				title: "hook.txt",
				mimetype: "text/plain",
				parent: "hook-folder",
			},
		);

		await new Promise((resolve) => setTimeout(resolve, 150));

		const nodeOrErr = await harness.nodeService.get(adminCtx, "hook-file");
		expect(nodeOrErr.isRight()).toBe(true);
		if (nodeOrErr.isRight()) {
			expect(nodeOrErr.value.description).toBeUndefined();
		}
	});
});
