import { describe, it } from "bdd";
import { expect } from "expect";
import type { AuthenticationContext } from "application/security/authentication_context.ts";
import { InMemoryConfigurationRepository } from "adapters/inmem/inmem_configuration_repository.ts";
import { type CreateFeatureData, FeaturesService } from "application/features/features_service.ts";
import { ADMINS_GROUP_UUID } from "domain/configuration/builtin_groups.ts";
import { MOVE_UP_FEATURE_UUID } from "domain/configuration/builtin_features.ts";

describe("FeaturesService", () => {
	const createFixture = () => {
		const configRepo = new InMemoryConfigurationRepository();

		return {
			configRepo,
			service: new FeaturesService({ configRepo }),
		};
	};

	const createService = () => createFixture().service;

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

	const sampleFeatureRun = `async function(_ctx, _args) {
		console.log("Test feature executed");
	}`;

	const sampleLegacyFeatureModule = `export default {
		uuid: "legacy-feature",
		title: "Legacy Feature",
		description: "Stored as a full module",
		exposeAction: true,
		runOnCreates: false,
		runOnUpdates: false,
		runOnDeletes: false,
		runOnEmbeddingsCreated: false,
		runOnEmbeddingsUpdated: false,
		runManually: true,
		filters: [],
		exposeExtension: false,
		exposeAITool: false,
		groupsAllowed: [],
		parameters: [],
		returnType: "void",
		async run(_ctx, _args) {
			console.log("legacy feature executed");
		}
	};`;

	const defaultActionParameters: CreateFeatureData["parameters"] = [
		{
			name: "uuids",
			type: "array",
			arrayType: "string",
			required: true,
			description: "Node UUIDs",
		},
	];

	let featureCounter = 0;

	function createFeatureInput(overrides: Partial<CreateFeatureData> = {}): CreateFeatureData {
		featureCounter += 1;

		const parameters = overrides.parameters ??
			(overrides.exposeAction === false ? [] : defaultActionParameters);

		return {
			uuid: `feature_${featureCounter}_uuid`,
			title: "Test Feature",
			description: "Feature used in tests",
			exposeAction: true,
			runOnCreates: false,
			runOnUpdates: false,
			runOnDeletes: false,
			runOnEmbeddingsCreated: false,
			runOnEmbeddingsUpdated: false,
			runManually: true,
			filters: [],
			exposeExtension: false,
			exposeAITool: false,
			runAs: undefined,
			groupsAllowed: [],
			parameters,
			returnType: "void",
			run: sampleFeatureRun,
			...overrides,
		};
	}

	describe("createFeature", () => {
		it("should create feature successfully as admin", async () => {
			const service = createService();

			const result = await service.createFeature(
				adminCtx,
				createFeatureInput({
					title: "Custom Action",
					description: "A custom action feature",
					exposeAction: true,
					runOnCreates: false,
					runOnUpdates: false,
					runOnDeletes: false,
					runManually: true,
					filters: [["mimetype", "==", "text/markdown"]],
					exposeExtension: false,
					exposeAITool: true,
					runAs: undefined,
					groupsAllowed: ["--editors--"],
					parameters: [
						{
							name: "uuids",
							type: "array",
							arrayType: "string",
							required: true,
							description: "Node UUIDs",
						},
						{
							name: "message",
							type: "string",
							required: true,
							description: "The message to display",
						},
					],
					returnType: "string",
					returnDescription: "Returns the processed message",
					returnContentType: "text/plain",
					tags: ["custom", "action"],
					run: sampleFeatureRun,
				}),
			);

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				const feature = result.value;
				expect(feature.uuid).toBeDefined();
				expect(feature.title).toBe("Custom Action");
				expect(feature.description).toBe("A custom action feature");
				expect(feature.exposeAction).toBe(true);
				expect(feature.exposeAITool).toBe(true);
				expect(feature.filters.length).toBe(1);
				expect(feature.parameters.length).toBe(2);
				expect(feature.parameters[0].name).toBe("uuids");
				expect(feature.returnType).toBe("string");
				expect(feature.run).toBe(sampleFeatureRun);
				expect(feature.createdTime).toBeDefined();
				expect(feature.modifiedTime).toBeDefined();
			}
		});

		it("should preserve a provided uuid", async () => {
			const service = createService();

			const result = await service.createFeature(adminCtx, {
				uuid: "raw_upload_feature",
				title: "Custom Action",
				description: "A custom action feature",
				exposeAction: true,
				runOnCreates: false,
				runOnUpdates: false,
				runOnDeletes: false,
				runOnEmbeddingsCreated: false,
				runOnEmbeddingsUpdated: false,
				runManually: true,
				filters: [],
				exposeExtension: false,
				exposeAITool: false,
				runAs: undefined,
				groupsAllowed: [],
				parameters: defaultActionParameters,
				returnType: "void",
				run: sampleFeatureRun,
			});

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				expect(result.value.uuid).toBe("raw_upload_feature");
			}
		});

		it("should reject creation as non-admin", async () => {
			const service = createService();

			const result = await service.createFeature(
				userCtx,
				createFeatureInput({
					title: "Unauthorized Feature",
					description: "Should fail",
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
					parameters: defaultActionParameters,
					returnType: "void",
					run: sampleFeatureRun,
				}),
			);

			expect(result.isLeft()).toBe(true);
		});

		it("should validate required fields", async () => {
			const service = createService();

			const result = await service.createFeature(
				adminCtx,
				createFeatureInput({
					title: "",
					description: "Missing title",
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
					parameters: defaultActionParameters,
					returnType: "void",
					run: sampleFeatureRun,
				}),
			);

			expect(result.isLeft()).toBe(true);
		});

		it("should validate run is not empty", async () => {
			const service = createService();

			const result = await service.createFeature(
				adminCtx,
				createFeatureInput({
					title: "Invalid Feature",
					description: "Missing run",
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
					parameters: defaultActionParameters,
					returnType: "void",
					run: "",
				}),
			);

			expect(result.isLeft()).toBe(true);
		});

		it("should require at least one exposure mode", async () => {
			const service = createService();

			const result = await service.createFeature(
				adminCtx,
				createFeatureInput({
					exposeAction: false,
					exposeExtension: false,
					exposeAITool: false,
				}),
			);

			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) {
				expect(result.value.message).toContain("Feature must be exposed");
			}
		});

		it("should require automatic features to be actions", async () => {
			const service = createService();

			const result = await service.createFeature(
				adminCtx,
				createFeatureInput({
					exposeAction: false,
					exposeExtension: true,
					runOnCreates: true,
				}),
			);

			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) {
				expect(result.value.message).toContain(
					"Automatic feature execution requires exposeAction",
				);
			}
		});

		it("should require actions to declare uuids parameter", async () => {
			const service = createService();

			const result = await service.createFeature(
				adminCtx,
				createFeatureInput({
					parameters: [],
				}),
			);

			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) {
				expect(result.value.message).toContain(
					"Action features must declare required parameter 'uuids'",
				);
			}
		});

		it("should require uuids parameter to be array<string>", async () => {
			const service = createService();

			const result = await service.createFeature(
				adminCtx,
				createFeatureInput({
					parameters: [
						{
							name: "uuids",
							type: "string",
							required: true,
						},
					],
				}),
			);

			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) {
				expect(result.value.message).toContain(
					"Action features must declare required parameter 'uuids'",
				);
			}
		});
	});

	describe("getFeature", () => {
		it("should get feature successfully", async () => {
			const service = createService();

			const createResult = await service.createFeature(
				adminCtx,
				createFeatureInput({
					title: "Test Feature",
					description: "Test description",
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
					parameters: defaultActionParameters,
					returnType: "void",
					run: sampleFeatureRun,
				}),
			);

			expect(createResult.isRight()).toBe(true);
			if (!createResult.isRight()) return;

			const result = await service.getFeature(adminCtx, createResult.value.uuid);

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				expect(result.value.uuid).toBe(createResult.value.uuid);
			}
		});

		it("should get builtin feature", async () => {
			const service = createService();

			const result = await service.getFeature(adminCtx, MOVE_UP_FEATURE_UUID);

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				expect(result.value.uuid).toBe(MOVE_UP_FEATURE_UUID);
				expect(result.value.title).toBe("Move Up");
				expect(result.value.run).toBeDefined();
			}
		});

		it("should allow non-admin to get feature", async () => {
			const service = createService();

			const createResult = await service.createFeature(
				adminCtx,
				createFeatureInput({
					title: "Public Feature",
					description: "Accessible to all",
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
					parameters: defaultActionParameters,
					returnType: "void",
					run: sampleFeatureRun,
				}),
			);

			expect(createResult.isRight()).toBe(true);
			if (!createResult.isRight()) return;

			const result = await service.getFeature(userCtx, createResult.value.uuid);

			expect(result.isRight()).toBe(true);
		});

		it("should reject non-admin get when feature groups are not allowed", async () => {
			const service = createService();

			const createResult = await service.createFeature(
				adminCtx,
				createFeatureInput({
					title: "Restricted Feature",
					description: "Restricted",
					groupsAllowed: ["--editors--"],
				}),
			);

			expect(createResult.isRight()).toBe(true);
			if (!createResult.isRight()) return;

			const result = await service.getFeature(userCtx, createResult.value.uuid);

			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) {
				expect(result.value.errorCode).toBe("ForbiddenError");
			}
		});

		it("migrates legacy module-based features on read", async () => {
			const fixture = createFixture();

			await fixture.configRepo.save(
				"features",
				{
					uuid: "legacy-feature",
					title: "Legacy Feature",
					description: "Stored as a full module",
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
					parameters: defaultActionParameters,
					returnType: "void",
					createdTime: "2024-01-01T00:00:00.000Z",
					modifiedTime: "2024-01-01T00:00:00.000Z",
					module: sampleLegacyFeatureModule,
				} as unknown as import("domain/configuration/feature_data.ts").FeatureData,
			);

			const result = await fixture.service.getFeature(adminCtx, "legacy-feature");

			expect(result.isRight()).toBe(true);
			if (!result.isRight()) return;

			expect(result.value.run).toContain("legacy feature executed");

			const persisted = await fixture.configRepo.get("features", "legacy-feature");
			expect(persisted.isRight()).toBe(true);
			if (!persisted.isRight()) return;

			const stored = persisted.value as unknown as { run?: string; module?: string };
			expect(stored.run).toContain("legacy feature executed");
			expect(stored.module).toBeUndefined();
		});
	});

	describe("listFeatures", () => {
		it("should list all features including builtins", async () => {
			const service = createService();

			// Create two custom features
			await service.createFeature(
				adminCtx,
				createFeatureInput({
					title: "Feature A",
					description: "First feature",
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
					parameters: defaultActionParameters,
					returnType: "void",
					run: sampleFeatureRun,
				}),
			);

			await service.createFeature(
				adminCtx,
				createFeatureInput({
					title: "Feature B",
					description: "Second feature",
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
					parameters: defaultActionParameters,
					returnType: "void",
					run: sampleFeatureRun,
				}),
			);

			const result = await service.listFeatures(adminCtx);

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				// Should include 2 custom features + 3 builtins (Move Up, Call Agent, Auto Tag)
				expect(result.value.length).toBe(5);
			}
		});

		it("should allow non-admin to list features", async () => {
			const service = createService();

			await service.createFeature(
				adminCtx,
				createFeatureInput({
					title: "Test Feature",
					description: "Test",
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
					parameters: defaultActionParameters,
					returnType: "void",
					run: sampleFeatureRun,
				}),
			);

			const result = await service.listFeatures(userCtx);

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				expect(result.value.length).toBeGreaterThan(0);
			}
		});

		it("should hide unrunnable features from non-admin lists", async () => {
			const service = createService();

			await service.createFeature(
				adminCtx,
				createFeatureInput({ title: "Public Feature", groupsAllowed: [] }),
			);
			await service.createFeature(
				adminCtx,
				createFeatureInput({ title: "Restricted Feature", groupsAllowed: ["--editors--"] }),
			);

			const result = await service.listFeatures(userCtx);

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				expect(result.value.some((feature) => feature.title === "Public Feature")).toBe(true);
				expect(result.value.some((feature) => feature.title === "Restricted Feature")).toBe(
					false,
				);
			}
		});

		it("migrates legacy module-based features when listing", async () => {
			const fixture = createFixture();

			await fixture.configRepo.save(
				"features",
				{
					uuid: "legacy-list-feature",
					title: "Legacy List Feature",
					description: "Stored as a full module",
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
					parameters: defaultActionParameters,
					returnType: "void",
					createdTime: "2024-01-01T00:00:00.000Z",
					modifiedTime: "2024-01-01T00:00:00.000Z",
					module: sampleLegacyFeatureModule.replaceAll("legacy-feature", "legacy-list-feature")
						.replaceAll("Legacy Feature", "Legacy List Feature"),
				} as unknown as import("domain/configuration/feature_data.ts").FeatureData,
			);

			const result = await fixture.service.listFeatures(adminCtx);

			expect(result.isRight()).toBe(true);
			if (!result.isRight()) return;

			expect(result.value.some((feature) => feature.uuid === "legacy-list-feature")).toBe(true);

			const persisted = await fixture.configRepo.get("features", "legacy-list-feature");
			expect(persisted.isRight()).toBe(true);
			if (!persisted.isRight()) return;

			const stored = persisted.value as unknown as { run?: string; module?: string };
			expect(stored.run).toContain("legacy feature executed");
			expect(stored.module).toBeUndefined();
		});
	});

	describe("updateFeature", () => {
		it("should update feature successfully as admin", async () => {
			const service = createService();

			const createResult = await service.createFeature(
				adminCtx,
				createFeatureInput({
					title: "Original Title",
					description: "Original description",
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
					parameters: defaultActionParameters,
					returnType: "void",
					run: sampleFeatureRun,
				}),
			);

			expect(createResult.isRight()).toBe(true);
			if (!createResult.isRight()) return;

			const updatedRun = sampleFeatureRun.replace(
				"Test feature executed",
				"Updated feature executed",
			);

			const result = await service.updateFeature(adminCtx, createResult.value.uuid, {
				title: "Updated Title",
				exposeAITool: true,
				run: updatedRun,
			});

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				expect(result.value.title).toBe("Updated Title");
				expect(result.value.exposeAITool).toBe(true);
				expect(result.value.run).toBe(updatedRun);
				expect(result.value.description).toBe("Original description");
				expect(result.value.createdTime).toBe(createResult.value.createdTime);
				expect(result.value.modifiedTime).toBeDefined();
			}
		});

		it("should reject update as non-admin", async () => {
			const service = createService();

			const createResult = await service.createFeature(
				adminCtx,
				createFeatureInput({
					title: "Test Feature",
					description: "Test",
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
					parameters: defaultActionParameters,
					returnType: "void",
					run: sampleFeatureRun,
				}),
			);

			expect(createResult.isRight()).toBe(true);
			if (!createResult.isRight()) return;

			const result = await service.updateFeature(userCtx, createResult.value.uuid, {
				title: "Hacked Title",
			});

			expect(result.isLeft()).toBe(true);
		});

		it("should reject update of builtin feature", async () => {
			const service = createService();

			const result = await service.updateFeature(adminCtx, MOVE_UP_FEATURE_UUID, {
				title: "Modified Move Up",
			});

			expect(result.isLeft()).toBe(true);
		});

		it("should validate updated run is not empty", async () => {
			const service = createService();

			const createResult = await service.createFeature(
				adminCtx,
				createFeatureInput({
					title: "Test Feature",
					description: "Test",
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
					parameters: defaultActionParameters,
					returnType: "void",
					run: sampleFeatureRun,
				}),
			);

			expect(createResult.isRight()).toBe(true);
			if (!createResult.isRight()) return;

			const result = await service.updateFeature(adminCtx, createResult.value.uuid, {
				run: "",
			});

			expect(result.isLeft()).toBe(true);
		});

		it("should reject update that removes action uuids parameter", async () => {
			const service = createService();

			const createResult = await service.createFeature(
				adminCtx,
				createFeatureInput({
					title: "Validated Action",
					description: "Has required uuids parameter",
				}),
			);

			expect(createResult.isRight()).toBe(true);
			if (!createResult.isRight()) return;

			const result = await service.updateFeature(adminCtx, createResult.value.uuid, {
				parameters: [],
			});

			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) {
				expect(result.value.message).toContain(
					"Action features must declare required parameter 'uuids'",
				);
			}
		});

		it("should reject update that turns feature into action without uuids parameter", async () => {
			const service = createService();

			const createResult = await service.createFeature(
				adminCtx,
				createFeatureInput({
					exposeAction: false,
					exposeExtension: true,
					parameters: [],
				}),
			);

			expect(createResult.isRight()).toBe(true);
			if (!createResult.isRight()) return;

			const result = await service.updateFeature(adminCtx, createResult.value.uuid, {
				exposeAction: true,
				exposeExtension: false,
			});

			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) {
				expect(result.value.message).toContain(
					"Action features must declare required parameter 'uuids'",
				);
			}
		});
	});

	describe("deleteFeature", () => {
		it("should delete feature successfully as admin", async () => {
			const service = createService();

			const createResult = await service.createFeature(
				adminCtx,
				createFeatureInput({
					title: "To Delete",
					description: "Will be deleted",
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
					parameters: defaultActionParameters,
					returnType: "void",
					run: sampleFeatureRun,
				}),
			);

			expect(createResult.isRight()).toBe(true);
			if (!createResult.isRight()) return;

			const result = await service.deleteFeature(adminCtx, createResult.value.uuid);

			expect(result.isRight()).toBe(true);

			// Verify it's gone
			const getResult = await service.getFeature(adminCtx, createResult.value.uuid);
			expect(getResult.isLeft()).toBe(true);
		});

		it("should reject delete as non-admin", async () => {
			const service = createService();

			const createResult = await service.createFeature(
				adminCtx,
				createFeatureInput({
					title: "Protected Feature",
					description: "Cannot be deleted by users",
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
					parameters: defaultActionParameters,
					returnType: "void",
					run: sampleFeatureRun,
				}),
			);

			expect(createResult.isRight()).toBe(true);
			if (!createResult.isRight()) return;

			const result = await service.deleteFeature(userCtx, createResult.value.uuid);

			expect(result.isLeft()).toBe(true);
		});

		it("should reject delete of builtin feature", async () => {
			const service = createService();

			const result = await service.deleteFeature(adminCtx, MOVE_UP_FEATURE_UUID);

			expect(result.isLeft()).toBe(true);
		});
	});

	describe("exportFeature", () => {
		it("should allow admins to export features", async () => {
			const service = createService();

			const createResult = await service.createFeature(
				adminCtx,
				createFeatureInput({ title: "Exportable Feature" }),
			);

			expect(createResult.isRight()).toBe(true);
			if (!createResult.isRight()) return;

			const result = await service.exportFeature(adminCtx, createResult.value.uuid);

			expect(result.isRight()).toBe(true);
		});

		it("should reject non-admin export with forbidden", async () => {
			const service = createService();

			const createResult = await service.createFeature(
				adminCtx,
				createFeatureInput({ title: "Restricted Export" }),
			);

			expect(createResult.isRight()).toBe(true);
			if (!createResult.isRight()) return;

			const result = await service.exportFeature(userCtx, createResult.value.uuid);

			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) {
				expect(result.value.errorCode).toBe("ForbiddenError");
			}
		});
	});
});
