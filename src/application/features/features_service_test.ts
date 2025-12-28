import { describe, it } from "bdd";
import { expect } from "expect";
import type { AuthenticationContext } from "application/security/authentication_context.ts";
import { InMemoryConfigurationRepository } from "adapters/inmem/inmem_configuration_repository.ts";
import { InMemoryEventBus } from "adapters/inmem/inmem_event_bus.ts";
import { FeaturesService } from "application/features/features_service.ts";
import { ADMINS_GROUP_UUID } from "domain/configuration/builtin_groups.ts";
import { MOVE_UP_FEATURE_UUID } from "domain/configuration/builtin_features.ts";

describe("FeaturesService", () => {
	const createService = () =>
		new FeaturesService({
			configRepo: new InMemoryConfigurationRepository(),
			nodeService: null as any,
			eventBus: new InMemoryEventBus(),
		});

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

	const sampleFeatureModule =
		`import type { RunContext } from "domain/features/feature_run_context.ts";
import { Feature } from "domain/features/feature.ts";

const testFeature: Feature = {
	uuid: "test-feature",
	title: "Test Feature",
	description: "A test feature",
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
	parameters: [],
	returnType: "void",
	returnDescription: "Does nothing",

	async run(ctx: RunContext, args: Record<string, unknown>): Promise<void> {
		console.log("Test feature executed");
	},
};

export default testFeature;
`;

	describe("createFeature", () => {
		it("should create feature successfully as admin", async () => {
			const service = createService();

			const result = await service.createFeature(adminCtx, {
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
				module: sampleFeatureModule,
			});

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				const feature = result.value;
				expect(feature.uuid).toBeDefined();
				expect(feature.title).toBe("Custom Action");
				expect(feature.description).toBe("A custom action feature");
				expect(feature.exposeAction).toBe(true);
				expect(feature.exposeAITool).toBe(true);
				expect(feature.filters.length).toBe(1);
				expect(feature.parameters.length).toBe(1);
				expect(feature.returnType).toBe("string");
				expect(feature.module).toBe(sampleFeatureModule);
				expect(feature.createdTime).toBeDefined();
				expect(feature.modifiedTime).toBeDefined();
			}
		});

		it("should reject creation as non-admin", async () => {
			const service = createService();

			const result = await service.createFeature(userCtx, {
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
				parameters: [],
				returnType: "void",
				module: sampleFeatureModule,
			});

			expect(result.isLeft()).toBe(true);
		});

		it("should validate required fields", async () => {
			const service = createService();

			const result = await service.createFeature(adminCtx, {
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
				parameters: [],
				returnType: "void",
				module: sampleFeatureModule,
			});

			expect(result.isLeft()).toBe(true);
		});

		it("should validate module is not empty", async () => {
			const service = createService();

			const result = await service.createFeature(adminCtx, {
				title: "Invalid Feature",
				description: "Missing module",
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
				parameters: [],
				returnType: "void",
				module: "",
			});

			expect(result.isLeft()).toBe(true);
		});
	});

	describe("getFeature", () => {
		it("should get feature successfully", async () => {
			const service = createService();

			const createResult = await service.createFeature(adminCtx, {
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
				parameters: [],
				returnType: "void",
				module: sampleFeatureModule,
			});

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
				expect(result.value.module).toBeDefined();
			}
		});

		it("should allow non-admin to get feature", async () => {
			const service = createService();

			const createResult = await service.createFeature(adminCtx, {
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
				parameters: [],
				returnType: "void",
				module: sampleFeatureModule,
			});

			expect(createResult.isRight()).toBe(true);
			if (!createResult.isRight()) return;

			const result = await service.getFeature(userCtx, createResult.value.uuid);

			expect(result.isRight()).toBe(true);
		});
	});

	describe("listFeatures", () => {
		it("should list all features including builtins", async () => {
			const service = createService();

			// Create two custom features
			await service.createFeature(adminCtx, {
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
				parameters: [],
				returnType: "void",
				module: sampleFeatureModule,
			});

			await service.createFeature(adminCtx, {
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
				parameters: [],
				returnType: "void",
				module: sampleFeatureModule,
			});

			const result = await service.listFeatures(adminCtx);

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				// Should include 2 custom features + 1 builtin (Move Up)
				expect(result.value.length).toBe(3);
			}
		});

		it("should allow non-admin to list features", async () => {
			const service = createService();

			await service.createFeature(adminCtx, {
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
				parameters: [],
				returnType: "void",
				module: sampleFeatureModule,
			});

			const result = await service.listFeatures(userCtx);

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				expect(result.value.length).toBeGreaterThan(0);
			}
		});
	});

	describe("updateFeature", () => {
		it("should update feature successfully as admin", async () => {
			const service = createService();

			const createResult = await service.createFeature(adminCtx, {
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
				parameters: [],
				returnType: "void",
				module: sampleFeatureModule,
			});

			expect(createResult.isRight()).toBe(true);
			if (!createResult.isRight()) return;

			const updatedModule = sampleFeatureModule.replace(
				"Test feature executed",
				"Updated feature executed",
			);

			const result = await service.updateFeature(adminCtx, createResult.value.uuid, {
				title: "Updated Title",
				exposeAITool: true,
				module: updatedModule,
			});

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				expect(result.value.title).toBe("Updated Title");
				expect(result.value.exposeAITool).toBe(true);
				expect(result.value.module).toBe(updatedModule);
				expect(result.value.description).toBe("Original description");
				expect(result.value.createdTime).toBe(createResult.value.createdTime);
				expect(result.value.modifiedTime).toBeDefined();
			}
		});

		it("should reject update as non-admin", async () => {
			const service = createService();

			const createResult = await service.createFeature(adminCtx, {
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
				parameters: [],
				returnType: "void",
				module: sampleFeatureModule,
			});

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

		it("should validate updated module is not empty", async () => {
			const service = createService();

			const createResult = await service.createFeature(adminCtx, {
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
				parameters: [],
				returnType: "void",
				module: sampleFeatureModule,
			});

			expect(createResult.isRight()).toBe(true);
			if (!createResult.isRight()) return;

			const result = await service.updateFeature(adminCtx, createResult.value.uuid, {
				module: "",
			});

			expect(result.isLeft()).toBe(true);
		});
	});

	describe("deleteFeature", () => {
		it("should delete feature successfully as admin", async () => {
			const service = createService();

			const createResult = await service.createFeature(adminCtx, {
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
				parameters: [],
				returnType: "void",
				module: sampleFeatureModule,
			});

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

			const createResult = await service.createFeature(adminCtx, {
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
				parameters: [],
				returnType: "void",
				module: sampleFeatureModule,
			});

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
});
