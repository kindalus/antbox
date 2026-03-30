import { describe, it } from "bdd";
import { expect } from "expect";
import {
	exportFeatureHandler,
	getFeatureHandler,
	parseFeatureUpload,
} from "./features_handlers.ts";
import type { AntboxTenant } from "./antbox_tenant.ts";
import { ForbiddenError } from "shared/antbox_error.ts";
import { left, right } from "shared/either.ts";

const featureModule = `export default {
	uuid: "raw_upload_feature",
	title: "Raw Upload Feature",
	description: "Parses a raw JavaScript upload",
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
	parameters: [{
		name: "uuids",
		type: "array",
		arrayType: "string",
		required: true,
		description: "Node UUIDs"
	}, {
		name: "suffix",
		type: "string",
		required: true,
		description: "Suffix to append"
	}],
	returnType: "void",
	tags: ["upload"],
	async run() {
		return undefined;
	},
};`;

const featureModuleWithoutUuid = `export default {
	title: "Filename Feature",
	description: "Uses filename fallback",
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
	parameters: [{
		name: "uuids",
		type: "array",
		arrayType: "string",
		required: true,
		description: "Node UUIDs"
	}],
	returnType: "void",
	async run() {
		return undefined;
	},
};`;

const invalidActionFeatureModule = `export default {
	uuid: "invalid_action_feature",
	title: "Invalid Action Feature",
	description: "Missing uuids parameter",
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
	parameters: [{
		name: "suffix",
		type: "string",
		required: true
	}],
	returnType: "void",
	async run() {
		return undefined;
	},
	};`;

function makeTenant(overrides: Partial<AntboxTenant> = {}): AntboxTenant {
	return {
		name: "default",
		rootPasswd: "root",
		symmetricKey: "secret",
		limits: { storage: 1, tokens: 0 },
		configurationRepository: {} as AntboxTenant["configurationRepository"],
		nodeService: {} as AntboxTenant["nodeService"],
		aspectsService: {} as AntboxTenant["aspectsService"],
		featuresService: {} as AntboxTenant["featuresService"],
		apiKeysService: {} as AntboxTenant["apiKeysService"],
		groupsService: {} as AntboxTenant["groupsService"],
		usersService: {} as AntboxTenant["usersService"],
		articleService: {} as AntboxTenant["articleService"],
		auditLoggingService: {} as AntboxTenant["auditLoggingService"],
		workflowsService: {} as AntboxTenant["workflowsService"],
		workflowInstancesService: {} as AntboxTenant["workflowInstancesService"],
		agentsService: {} as AntboxTenant["agentsService"],
		notificationsService: {} as AntboxTenant["notificationsService"],
		userPreferencesService: {} as AntboxTenant["userPreferencesService"],
		externalLoginService: {} as AntboxTenant["externalLoginService"],
		metricsService: {} as AntboxTenant["metricsService"],
		featuresEngine: {} as AntboxTenant["featuresEngine"],
		agentsEngine: {} as AntboxTenant["agentsEngine"],
		workflowInstancesEngine: {} as AntboxTenant["workflowInstancesEngine"],
		...overrides,
	};
}

describe("features_handlers", () => {
	describe("parseFeatureUpload", () => {
		it("parses multipart feature uploads", async () => {
			const formData = new FormData();
			formData.set(
				"file",
				new File([featureModule], "different name.js", {
					type: "application/javascript",
				}),
			);

			const req = new Request("http://localhost/v2/features/-/upload", {
				method: "POST",
				body: formData,
			});

			const result = await parseFeatureUpload(req);

			expect(result.isRight()).toBe(true);
			if (!result.isRight()) {
				return;
			}

			expect(result.value.uuid).toBe("raw_upload_feature");
			expect(result.value.title).toBe("Raw Upload Feature");
			expect(result.value.parameters[0].name).toBe("uuids");
			expect(result.value.parameters[1].name).toBe("suffix");
			expect(result.value.run).toContain("return undefined;");
			expect(result.value.run.startsWith("async function")).toBe(true);
		});

		it("falls back to the uploaded file name when uuid is missing", async () => {
			const formData = new FormData();
			formData.set(
				"file",
				new File([featureModuleWithoutUuid], "minha feature.js", {
					type: "application/javascript",
				}),
			);

			const req = new Request("http://localhost/v2/features/-/upload", {
				method: "POST",
				body: formData,
			});

			const result = await parseFeatureUpload(req);

			expect(result.isRight()).toBe(true);
			if (!result.isRight()) {
				return;
			}

			expect(result.value.uuid).toBe("minha_feature");
		});

		it("rejects requests without a file", async () => {
			const req = new Request("http://localhost/v2/features/-/upload", {
				method: "POST",
				body: new FormData(),
			});

			const result = await parseFeatureUpload(req);

			expect(result.isLeft()).toBe(true);
			if (!result.isLeft()) {
				return;
			}

			expect(result.value.message).toContain("{ file }");
		});

		it("rejects action uploads without required uuids parameter", async () => {
			const formData = new FormData();
			formData.set(
				"file",
				new File([invalidActionFeatureModule], "invalid_action_feature.js", {
					type: "application/javascript",
				}),
			);

			const req = new Request("http://localhost/v2/features/-/upload", {
				method: "POST",
				body: formData,
			});

			const result = await parseFeatureUpload(req);

			expect(result.isLeft()).toBe(true);
			if (!result.isLeft()) {
				return;
			}

			expect(result.value.message).toContain(
				"Action features must declare required parameter 'uuids'",
			);
		});
	});

	describe("handlers", () => {
		it("returns forbidden when getFeature is unauthorized", async () => {
			const handler = getFeatureHandler([
				makeTenant({
					featuresService: {
						getFeature: async () =>
							left(new ForbiddenError("Not authorized to access this feature")),
					} as unknown as AntboxTenant["featuresService"],
				}),
			]);

			const response = await handler(
				new Request("http://localhost/v2/features/restricted", {
					headers: { "x-params": JSON.stringify({ uuid: "restricted" }) },
				}),
			);

			expect(response.status).toBe(403);
		});

		it("returns forbidden when exportFeature is unauthorized", async () => {
			const handler = exportFeatureHandler([
				makeTenant({
					featuresService: {
						exportFeature: async () =>
							left(new ForbiddenError("Only admins can export features")),
					} as unknown as AntboxTenant["featuresService"],
				}),
			]);

			const response = await handler(
				new Request("http://localhost/v2/features/restricted/-/export", {
					headers: { "x-params": JSON.stringify({ uuid: "restricted" }) },
				}),
			);

			expect(response.status).toBe(403);
		});

		it("exports feature modules for admins", async () => {
			const handler = exportFeatureHandler([
				makeTenant({
					featuresService: {
						exportFeature: async () =>
							right({
								uuid: "test_feature",
								title: "Test Feature",
								description: "Export test",
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
								parameters: [{
									name: "uuids",
									type: "array",
									arrayType: "string",
									required: true,
								}],
								returnType: "void",
								run: "async function() { return undefined; }",
								createdTime: "2024-01-01T00:00:00.000Z",
								modifiedTime: "2024-01-01T00:00:00.000Z",
							}),
					} as unknown as AntboxTenant["featuresService"],
				}),
			]);

			const response = await handler(
				new Request("http://localhost/v2/features/test_feature/-/export", {
					headers: { "x-params": JSON.stringify({ uuid: "test_feature" }) },
				}),
			);

			expect(response.status).toBe(200);
			expect(response.headers.get("Content-Type")).toBe("application/javascript");
		});
	});
});
