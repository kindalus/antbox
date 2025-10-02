import { describe, test } from "bdd";
import { expect } from "expect";
import { NodeService } from "./node_service.ts";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider.ts";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository.ts";
import type { AuthenticationContext } from "./authentication_context.ts";
import { BadRequestError } from "shared/antbox_error.ts";
import { ValidationError } from "shared/validation_error.ts";
import { InMemoryEventBus } from "adapters/inmem/inmem_event_bus.ts";
import { builtinFolders } from "application/builtin_folders/index.ts";
import { Groups } from "domain/users_groups/groups.ts";

const createNodeService = () => {
	const repository = new InMemoryNodeRepository();

	// Add builtin folders
	builtinFolders.forEach((folder) => repository.add(folder));

	const storage = new InMemoryStorageProvider();
	const eventBus = new InMemoryEventBus();

	return new NodeService({ repository, storage, bus: eventBus });
};

const adminAuthContext: AuthenticationContext = {
	mode: "Direct",
	tenant: "default",
	principal: {
		email: "admin@example.com",
		groups: [Groups.ADMINS_GROUP_UUID],
	},
};

describe("NodeService Feature Validation", () => {
	// === Action Feature Validation Tests ===

	test("should validate Action must have uuids parameter", async () => {
		const nodeService = createNodeService();

		const result = await nodeService.createFile(
			adminAuthContext,
			new File(["dummy content"], "action-without-uuids.js", {
				type: "application/javascript",
			}),
			{
				title: "action-without-uuids.js",
				parent: "--features--",
				mimetype: "application/vnd.antbox.feature",
				exposeAction: true,
				exposeExtension: false,
				exposeAITool: false,
				parameters: [
					{
						name: "message",
						type: "string",
						required: true,
					},
				],
			},
		);

		expect(result.isLeft()).toBeTruthy();
		if (result.isLeft()) {
			expect(result.value).toBeInstanceOf(ValidationError);
			expect((result.value as ValidationError).message).toContain("uuids");
		}
	});

	test("should validate Action uuids parameter must be array of strings", async () => {
		const nodeService = createNodeService();

		const result = await nodeService.createFile(
			adminAuthContext,
			new File(["dummy content"], "action-wrong-uuids-type.js", {
				type: "application/javascript",
			}),
			{
				title: "action-wrong-uuids-type.js",
				parent: "--features--",
				mimetype: "application/vnd.antbox.feature",
				exposeAction: true,
				exposeExtension: false,
				exposeAITool: false,
				parameters: [
					{
						name: "uuids",
						type: "string", // Should be array
						required: true,
					},
				],
			},
		);

		expect(result.isLeft()).toBeTruthy();
		if (result.isLeft()) {
			expect(result.value).toBeInstanceOf(ValidationError);
			expect((result.value as ValidationError).message).toContain("uuids");
		}
	});

	test("should validate Action uuids array must contain strings", async () => {
		const nodeService = createNodeService();

		const result = await nodeService.createFile(
			adminAuthContext,
			new File(["dummy content"], "action-wrong-array-type.js", {
				type: "application/javascript",
			}),
			{
				title: "action-wrong-array-type.js",
				parent: "--features--",
				mimetype: "application/vnd.antbox.feature",
				exposeAction: true,
				exposeExtension: false,
				exposeAITool: false,
				parameters: [
					{
						name: "uuids",
						type: "array",
						arrayType: "number", // Should be string
						required: true,
					},
				],
			},
		);

		expect(result.isLeft()).toBeTruthy();
		if (result.isLeft()) {
			expect(result.value).toBeInstanceOf(ValidationError);
			expect((result.value as ValidationError).message).toContain("uuids");
		}
	});

	test("should validate Action cannot have file parameters", async () => {
		const nodeService = createNodeService();

		const result = await nodeService.createFile(
			adminAuthContext,
			new File(["dummy content"], "action-with-file-param.js", {
				type: "application/javascript",
			}),
			{
				title: "action-with-file-param.js",
				parent: "--features--",
				mimetype: "application/vnd.antbox.feature",
				exposeAction: true,
				exposeExtension: false,
				exposeAITool: false,
				parameters: [
					{
						name: "uuids",
						type: "array",
						arrayType: "string",
						required: true,
					},
					{
						name: "file",
						type: "file",
						required: true,
					},
				],
			},
		);

		expect(result.isLeft()).toBeTruthy();
		if (result.isLeft()) {
			expect(result.value).toBeInstanceOf(ValidationError);
			expect((result.value as ValidationError).message).toContain("file");
		}
	});

	test("should allow valid Action", async () => {
		const nodeService = createNodeService();

		const result = await nodeService.createFile(
			adminAuthContext,
			new File(["dummy content"], "valid-action.js", {
				type: "application/javascript",
			}),
			{
				title: "valid-action.js",
				parent: "--features--",
				mimetype: "application/vnd.antbox.feature",
				exposeAction: true,
				exposeExtension: false,
				exposeAITool: false,
				parameters: [
					{
						name: "uuids",
						type: "array",
						arrayType: "string",
						required: true,
					},
				],
			},
		);

		expect(result.isRight()).toBeTruthy();
	});

	// === Extension Feature Validation Tests ===

	test("should validate Extension cannot have uuids parameter (unless also Action)", async () => {
		const nodeService = createNodeService();

		// Test Extension-only with uuids (should fail)
		const result = await nodeService.createFile(
			adminAuthContext,
			new File(["dummy content"], "extension-with-uuids.js", {
				type: "application/javascript",
			}),
			{
				title: "extension-with-uuids.js",
				parent: "--features--",
				mimetype: "application/vnd.antbox.feature",
				exposeAction: false,
				exposeExtension: true,
				exposeAITool: false,
				parameters: [
					{
						name: "uuids",
						type: "array",
						arrayType: "string",
						required: true,
					},
				],
			},
		);

		expect(result.isLeft()).toBeTruthy();
		if (result.isLeft()) {
			expect(result.value).toBeInstanceOf(BadRequestError);
			expect((result.value as BadRequestError).message).toContain("uuids parameter");
		}
	});

	test("should allow Extension with file parameters", async () => {
		const nodeService = createNodeService();

		const result = await nodeService.createFile(
			adminAuthContext,
			new File(["dummy content"], "extension-with-file.js", {
				type: "application/javascript",
			}),
			{
				title: "extension-with-file.js",
				parent: "--features--",
				mimetype: "application/vnd.antbox.feature",
				exposeAction: false,
				exposeExtension: true,
				exposeAITool: false,
				parameters: [
					{
						name: "file",
						type: "file",
						required: true,
					},
				],
			},
		);

		expect(result.isRight()).toBeTruthy();
	});

	test("should allow valid Extension", async () => {
		const nodeService = createNodeService();

		const result = await nodeService.createFile(
			adminAuthContext,
			new File(["dummy content"], "valid-extension.js", {
				type: "application/javascript",
			}),
			{
				title: "valid-extension.js",
				parent: "--features--",
				mimetype: "application/vnd.antbox.feature",
				exposeAction: false,
				exposeExtension: true,
				exposeAITool: false,
				parameters: [],
			},
		);

		expect(result.isRight()).toBeTruthy();
	});

	// === AI Tool Feature Validation Tests ===

	test("should validate AI Tool cannot have uuids parameter (unless also Action)", async () => {
		const nodeService = createNodeService();

		// Test AI Tool-only with uuids (should fail)
		const result = await nodeService.createFile(
			adminAuthContext,
			new File(["dummy content"], "ai-tool-with-uuids.js", {
				type: "application/javascript",
			}),
			{
				title: "ai-tool-with-uuids.js",
				parent: "--features--",
				mimetype: "application/vnd.antbox.feature",
				exposeAction: false,
				exposeExtension: false,
				exposeAITool: true,
				parameters: [
					{
						name: "uuids",
						type: "array",
						arrayType: "string",
						required: true,
					},
				],
			},
		);

		expect(result.isLeft()).toBeTruthy();
		if (result.isLeft()) {
			expect(result.value).toBeInstanceOf(BadRequestError);
			expect((result.value as BadRequestError).message).toContain("uuids parameter");
		}
	});

	test("should validate AI Tool cannot have file parameters", async () => {
		const nodeService = createNodeService();

		const result = await nodeService.createFile(
			adminAuthContext,
			new File(["dummy content"], "ai-tool-with-file.js", {
				type: "application/javascript",
			}),
			{
				title: "ai-tool-with-file.js",
				parent: "--features--",
				mimetype: "application/vnd.antbox.feature",
				exposeAction: false,
				exposeExtension: false,
				exposeAITool: true,
				parameters: [
					{
						name: "file",
						type: "file",
						required: true,
					},
				],
			},
		);

		expect(result.isLeft()).toBeTruthy();
		if (result.isLeft()) {
			expect(result.value).toBeInstanceOf(ValidationError);
			expect((result.value as ValidationError).message).toContain("file");
		}
	});

	test("should allow valid AI Tool", async () => {
		const nodeService = createNodeService();

		const result = await nodeService.createFile(
			adminAuthContext,
			new File(["dummy content"], "valid-ai-tool.js", {
				type: "application/javascript",
			}),
			{
				title: "valid-ai-tool.js",
				parent: "--features--",
				mimetype: "application/vnd.antbox.feature",
				exposeAction: false,
				exposeExtension: false,
				exposeAITool: true,
				parameters: [
					{
						name: "input",
						type: "string",
						required: true,
					},
				],
			},
		);

		expect(result.isRight()).toBeTruthy();
	});

	// === Multi-Subtype Feature Validation Tests ===

	test("should validate Action + AI Tool combination", async () => {
		const nodeService = createNodeService();

		const result = await nodeService.createFile(
			adminAuthContext,
			new File(["dummy content"], "action-ai-tool-combo.js", {
				type: "application/javascript",
			}),
			{
				title: "action-ai-tool-combo.js",
				parent: "--features--",
				mimetype: "application/vnd.antbox.feature",
				exposeAction: true,
				exposeExtension: false,
				exposeAITool: true,
				parameters: [
					{
						name: "uuids",
						type: "array",
						arrayType: "string",
						required: true,
					},
					{
						name: "input",
						type: "string",
						required: true,
					},
				],
			},
		);

		expect(result.isRight()).toBeTruthy();
	});

	// === General Feature Validation Tests ===

	test("should validate Feature must have at least one subtype exposure", async () => {
		const nodeService = createNodeService();

		const result = await nodeService.createFile(
			adminAuthContext,
			new File(["dummy content"], "no-exposure-feature.js", {
				type: "application/javascript",
			}),
			{
				title: "no-exposure-feature.js",
				parent: "--features--",
				mimetype: "application/vnd.antbox.feature",
				exposeAction: false,
				exposeExtension: false,
				exposeAITool: false,
				parameters: [],
			},
		);

		expect(result.isLeft()).toBeTruthy();
		if (result.isLeft()) {
			expect(result.value).toBeInstanceOf(BadRequestError);
			expect((result.value as BadRequestError).message).toContain("at least one");
		}
	});

	test("should validate Feature parameters array structure", async () => {
		const nodeService = createNodeService();

		const result = await nodeService.createFile(
			adminAuthContext,
			new File(["dummy content"], "malformed-params-feature.js", {
				type: "application/javascript",
			}),
			{
				title: "malformed-params-feature.js",
				parent: "--features--",
				mimetype: "application/vnd.antbox.feature",
				exposeAction: false,
				exposeExtension: false,
				exposeAITool: true,
				parameters: [
					{
						// Missing required 'name' field
						type: "string",
						required: true,
					} as any,
				],
			},
		);

		expect(result.isLeft()).toBeTruthy();
		if (result.isLeft()) {
			expect(result.value).toBeInstanceOf(BadRequestError);
			expect((result.value as BadRequestError).message).toContain("parameter");
		}
	});

	// Note: Feature property updates (exposeAction, exposeExtension, exposeAITool, parameters)
	// are handled by FeatureService.createOrReplace(), not NodeService.update(), so NodeService
	// update validation is not applicable for Feature-specific properties.
});
