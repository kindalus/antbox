import { expect } from "expect/expect";
import { describe, it } from "bdd";
import { InMemoryEventBus } from "adapters/inmem/inmem_event_bus.ts";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository.ts";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider.ts";

import { GroupNode } from "domain/users_groups/group_node.ts";
import { Groups } from "domain/users_groups/groups.ts";
import { BadRequestError } from "shared/antbox_error.ts";
import { ValidationError } from "shared/validation_error.ts";
import { FeatureService } from "application/feature_service.ts";
import { FeatureNotFoundError } from "domain/features/feature_not_found_error.ts";
import { AuthenticationContext } from "application/authentication_context.ts";
import { NodeService } from "application/node_service.ts";
import { UsersGroupsService } from "application/users_groups_service.ts";
import { builtinFolders } from "application/builtin_folders/index.ts";
import { errToMsg } from "shared/test_helpers.ts";

describe("FeatureService", () => {
	it("create should create a new feature", async () => {
		const service = await createService();
		const result = await service.createOrReplace(
			adminAuthContext,
			new File([testFeatureContent], "test-feature.js", {
				type: "application/javascript",
			}),
		);

		expect(result.isRight()).toBeTruthy();
		if (result.isRight()) {
			const node = result.value;
			expect(node.uuid).toBe("test-feature-uuid");
		}
	});

	it("update should replace existing feature", async () => {
		const service = await createService();
		const result = await service.createOrReplace(
			adminAuthContext,
			new File([testFeatureContent], "test-feature.js", {
				type: "application/javascript",
			}),
		);

		expect(result.isRight()).toBeTruthy();

		const updatedfeatureContent = `
      export default {
        uuid: "test-feature-uuid",
        name: "Updated Test feature",
        description: "This is an updated test feature.",
        exposeAction: true,
        runOnCreates: false,
        runOnUpdates: false,
        runManually: true,
        filters: [],
        exposeExtension: false,
        exposeAITool: false,
        groupsAllowed: ["admins"],
        parameters: [
          {
            name: "uuids",
            type: "array",
            arrayType: "string",
            required: true,
            description: "Node UUIDs to process"
          },
          {
            name: "param1",
            type: "string",
            required: true,
            description: "A new test parameter"
          }
        ],
        returnType: "string",
        returnDescription: "The returned string",

        run: async (ctx, args) => {
          return "Updated: " + args.param1;
        }
      };
    `;

		const updateResult = await service.createOrReplace(
			adminAuthContext,
			new File([updatedfeatureContent], "test-feature.js", {
				type: "application/javascript",
			}),
		);

		expect(updateResult.isRight()).toBeTruthy();

		const getResult = await service.get(adminAuthContext, "test-feature-uuid");
		expect(getResult.isRight()).toBeTruthy();

		if (getResult.isRight()) {
			const feature = getResult.value;
			expect(feature.name).toBe("Updated Test feature");
		}
	});

	it("get should return feature", async () => {
		const service = await createService();
		(await service.createOrReplace(
			adminAuthContext,
			new File([testFeatureContent], "test-feature.js", {
				type: "application/javascript",
			}),
		)).right;

		const result = await service.get(adminAuthContext, "test-feature-uuid");
		expect(result.isRight()).toBeTruthy();
		expect(result.right.name).toBe("Test feature");
	});

	it("get should return error if feature does not exist", async () => {
		const service = await createService();
		const result = await service.get(adminAuthContext, "non-existent-uuid");

		expect(result.isLeft()).toBeTruthy();
		expect(result.value).toBeInstanceOf(FeatureNotFoundError);
	});

	it("get should return error if node is not a feature", async () => {
		const service = await createService();
		const result = await service.get(adminAuthContext, "--group-1--");

		expect(result.isLeft()).toBeTruthy();
		expect(result.value).toBeInstanceOf(FeatureNotFoundError);
	});

	it("delete should remove feature", async () => {
		const service = await createService();
		await service.createOrReplace(
			adminAuthContext,
			new File([testFeatureContent], "test-feature.js", {
				type: "application/javascript",
			}),
		);

		const deleteResult = await service.delete(
			adminAuthContext,
			"test-feature-uuid",
		);

		expect(deleteResult.isRight()).toBeTruthy();

		const getResult = await service.get(adminAuthContext, "test-feature-uuid");
		expect(getResult.isLeft()).toBeTruthy();
		expect(getResult.value).toBeInstanceOf(FeatureNotFoundError);
	});

	it("list should return all features", async () => {
		const service = await createService();
		await service.createOrReplace(
			adminAuthContext,
			new File([testFeatureContent], "test-feature.js", {
				type: "application/javascript",
			}),
		);

		const result = await service.listFeatures(adminAuthContext);
		expect(result.isRight()).toBeTruthy();

		if (result.isRight()) {
			const features = result.value;
			expect(features.length).toBeGreaterThan(0);
			const testFeature = features.find((f) => f.name === "Test feature");
			expect(testFeature).toBeDefined();
		}
	});

	it("export should create a JavaScript file containing feature", async () => {
		const service = await createService();
		await service.createOrReplace(
			adminAuthContext,
			new File([testFeatureContent], "test-feature.js", {
				type: "application/javascript",
			}),
		);

		const result = await service.export(adminAuthContext, "test-feature-uuid");
		expect(result.isRight()).toBeTruthy();

		if (result.isRight()) {
			const file = result.value;
			expect(file.type).toBe("application/javascript");
			expect(file.name).toBe("test-feature-uuid.js");
		}
	});

	it("runAction should execute the feature and return result", async () => {
		const service = await createService();
		await service.createOrReplace(
			adminAuthContext,
			new File([testFeatureContent], "test-feature.js", {
				type: "application/javascript",
			}),
		);

		const result = await service.runAction(
			adminAuthContext,
			"test-feature-uuid",
			["--group-1--", "--group-2--"],
			{ param1: "World" },
		);

		expect(result.isRight()).toBeTruthy();
		if (result.isRight()) {
			expect(result.value).toBe("Hello, World");
		}
	});

	it("runAction should return error if parameter validation fails", async () => {
		const service = await createService();
		await service.createOrReplace(
			adminAuthContext,
			new File([testFeatureContent], "test-feature.js", {
				type: "application/javascript",
			}),
		);

		// Missing required parameter
		const result = await service.runAction(
			adminAuthContext,
			"test-feature-uuid",
			["--group-1--"],
			{}, // Missing param1
		);

		expect(result.isLeft()).toBeTruthy();
		if (result.isLeft()) {
			expect(result.value).toBeInstanceOf(BadRequestError);
			expect(result.value.message).toContain("param1");
		}
	});

	it("runAction should return error if feature cannot be run manually", async () => {
		const service = await createService();
		const nonManualfeatureContent = `
      export default {
        uuid: "non-manual-feature-uuid",
        name: "Non Manual feature",
        description: "This feature cannot be run manually.",
        exposeAction: true,
        runOnCreates: true,
        runOnUpdates: false,
        runManually: false,
        filters: [],
        exposeExtension: false,
        exposeAITool: false,
        groupsAllowed: ["admins"],
        parameters: [
          {
            name: "uuids",
            type: "array",
            arrayType: "string",
            required: true,
            description: "Node UUIDs to process"
          }
        ],
        returnType: "void",

        run: async (ctx, args) => {}
      };
    `;

		await service.createOrReplace(
			adminAuthContext,
			new File([nonManualfeatureContent], "non-manual-feature.js", {
				type: "application/javascript",
			}),
		);

		const result = await service.runAction(
			adminAuthContext,
			"non-manual-feature-uuid",
			["uuid1"],
			{},
		);

		expect(result.isLeft()).toBeTruthy();
		if (result.isLeft()) {
			expect(result.value).toBeInstanceOf(BadRequestError);
		}
	});

	// Validation tests
	it("should validate Feature must have uuid", async () => {
		const service = await createService();
		const invalidfeatureContent = `
      export default {
        name: "Invalid feature",
        description: "This feature has no UUID.",
        exposeAction: true,
        runOnCreates: false,
        runOnUpdates: false,
        runManually: true,
        filters: [],
        exposeExtension: false,
        exposeAITool: false,
        groupsAllowed: ["admins"],
        parameters: [],
        returnType: "void",

        run: async (ctx, args) => {}
      };
    `;

		const result = await service.createOrReplace(
			adminAuthContext,
			new File([invalidfeatureContent], "invalid-feature.js", {
				type: "application/javascript",
			}),
		);

		expect(result.isLeft()).toBeTruthy();
		expect(result.value).toBeInstanceOf(BadRequestError);
		expect((result.value as BadRequestError).message).toContain("uuid");
	});

	it("should validate Feature must have name", async () => {
		const service = await createService();
		const invalidfeatureContent = `
      export default {
        uuid: "invalid-feature-uuid",
        description: "This feature has no name.",
        exposeAction: true,
        runOnCreates: false,
        runOnUpdates: false,
        runManually: true,
        filters: [],
        exposeExtension: false,
        exposeAITool: false,
        groupsAllowed: ["admins"],
        parameters: [],
        returnType: "void",

        run: async (ctx, args) => {}
      };
    `;

		const result = await service.createOrReplace(
			adminAuthContext,
			new File([invalidfeatureContent], "invalid-feature.js", {
				type: "application/javascript",
			}),
		);

		expect(result.isLeft()).toBeTruthy();
		expect(result.value).toBeInstanceOf(BadRequestError);
		expect((result.value as BadRequestError).message).toContain("name");
	});

	it("should validate Feature must have run method", async () => {
		const service = await createService();
		const invalidfeatureContent = `
      export default {
        uuid: "invalid-feature-uuid",
        name: "Invalid feature",
        description: "This feature has no run method.",
        exposeAction: true,
        runOnCreates: false,
        runOnUpdates: false,
        runManually: true,
        filters: [],
        exposeExtension: false,
        exposeAITool: false,
        groupsAllowed: ["admins"],
        parameters: [],
        returnType: "void"
      };
    `;

		const result = await service.createOrReplace(
			adminAuthContext,
			new File([invalidfeatureContent], "invalid-feature.js", {
				type: "application/javascript",
			}),
		);

		expect(result.isLeft()).toBeTruthy();
		expect(result.value).toBeInstanceOf(BadRequestError);
		expect((result.value as BadRequestError).message).toContain("run");
	});

	it("should validate Feature must have default export", async () => {
		const service = await createService();
		const invalidfeatureContent = `
      const myfeature = {
        uuid: "invalid-feature-uuid",
        name: "Invalid feature",
        description: "This feature has no default export.",
        exposeAction: true,
        runOnCreates: false,
        runOnUpdates: false,
        runManually: true,
        filters: [],
        exposeExtension: false,
        exposeAITool: false,
        groupsAllowed: ["admins"],
        parameters: [],
        returnType: "void",

        run: async (ctx, args) => {}
      };

      export { myfeature };
    `;

		const result = await service.createOrReplace(
			adminAuthContext,
			new File([invalidfeatureContent], "invalid-feature.js", {
				type: "application/javascript",
			}),
		);

		expect(result.isLeft()).toBeTruthy();
		expect(result.value).toBeInstanceOf(BadRequestError);
		expect((result.value as BadRequestError).message).toContain(
			"default export",
		);
	});

	it("should validate invalid file type", async () => {
		const service = await createService();

		const result = await service.createOrReplace(
			adminAuthContext,
			new File([testFeatureContent], "test-feature.txt", {
				type: "text/plain",
			}),
		);

		expect(result.isLeft()).toBeTruthy();
		expect(result.value).toBeInstanceOf(BadRequestError);
		expect((result.value as BadRequestError).message).toContain(
			"Invalid file type",
		);
	});

	it("should validate malformed JavaScript", async () => {
		const service = await createService();
		const malformedContent = `
      export default {
        uuid: "malformed-uuid"
        name: "Malformed feature" // Missing comma
        run: not_a_feature
      }; // Missing closing brace
    `;

		const result = await service.createOrReplace(
			adminAuthContext,
			new File([malformedContent], "malformed.js", {
				type: "application/javascript",
			}),
		);

		expect(result.isLeft()).toBeTruthy();
		expect(result.value).toBeInstanceOf(BadRequestError);
	});

	it("should validate Action must have uuids parameter when exposeAction is true", async () => {
		const service = await createService();
		const invalidActionContent = `
      export default {
        uuid: "invalid-action-uuid",
        name: "Invalid Action",
        description: "Action without required uuids parameter",
        exposeAction: true,
        runOnCreates: false,
        runOnUpdates: false,
        runManually: true,
        filters: [],
        exposeExtension: false,
        exposeAITool: false,
        groupsAllowed: ["admins"],
        parameters: [
          {
            name: "param1",
            type: "string",
            required: true,
            description: "Some parameter"
          }
        ],
        returnType: "void",

        run: async (ctx, args) => {}
      };
    `;

		const result = await service.createOrReplace(
			adminAuthContext,
			new File([invalidActionContent], "invalid-action.js", {
				type: "application/javascript",
			}),
		);

		expect(result.isLeft()).toBeTruthy();
		expect(result.value).toBeInstanceOf(ValidationError);
		expect((result.value as ValidationError).message).toContain("uuids");
	});

	it("should validate uuids parameter must be array of strings for Actions", async () => {
		const service = await createService();
		const invalidActionContent = `
      export default {
        uuid: "invalid-action-uuid",
        name: "Invalid Action",
        description: "Action with wrong uuids parameter type",
        exposeAction: true,
        runOnCreates: false,
        runOnUpdates: false,
        runManually: true,
        filters: [],
        exposeExtension: false,
        exposeAITool: false,
        groupsAllowed: ["admins"],
        parameters: [
          {
            name: "uuids",
            type: "string", // Should be array
            required: true,
            description: "Node UUIDs"
          }
        ],
        returnType: "void",

        run: async (ctx, args) => {}
      };
    `;

		const result = await service.createOrReplace(
			adminAuthContext,
			new File([invalidActionContent], "invalid-action.js", {
				type: "application/javascript",
			}),
		);

		expect(result.isLeft()).toBeTruthy();
		expect(result.value).toBeInstanceOf(ValidationError);
		expect((result.value as ValidationError).message).toContain("uuids");
	});

	it("should validate file parameters not allowed for Actions", async () => {
		const service = await createService();
		const invalidActionContent = `
      export default {
        uuid: "invalid-action-uuid",
        name: "Invalid Action",
        description: "Action with file parameter",
        exposeAction: true,
        runOnCreates: false,
        runOnUpdates: false,
        runManually: true,
        filters: [],
        exposeExtension: false,
        exposeAITool: false,
        groupsAllowed: ["admins"],
        parameters: [
          {
            name: "uuids",
            type: "array",
            arrayType: "string",
            required: true,
            description: "Node UUIDs"
          },
          {
            name: "file",
            type: "file", // Not allowed for actions
            required: false,
            description: "File parameter"
          }
        ],
        returnType: "void",

        run: async (ctx, args) => {}
      };
    `;

		const result = await service.createOrReplace(
			adminAuthContext,
			new File([invalidActionContent], "invalid-action.js", {
				type: "application/javascript",
			}),
		);

		expect(result.isLeft()).toBeTruthy();
		expect(result.value).toBeInstanceOf(ValidationError);
		expect((result.value as ValidationError).message).toContain("file");
	});

	it("should validate file parameters not allowed for AI Tools", async () => {
		const service = await createService();
		const invalidAIToolContent = `
      export default {
        uuid: "invalid-ai-tool-uuid",
        name: "Invalid AI Tool",
        description: "AI Tool with file parameter",
        exposeAction: false,
        exposeExtension: false,
        exposeAITool: true,
        groupsAllowed: [],
        parameters: [
          {
            name: "file",
            type: "file", // Not allowed for AI tools
            required: false,
            description: "File parameter"
          }
        ],
        returnType: "void",

        run: async (ctx, args) => {}
      };
    `;

		const result = await service.createOrReplace(
			adminAuthContext,
			new File([invalidAIToolContent], "invalid-ai-tool.js", {
				type: "application/javascript",
			}),
		);

		expect(result.isLeft()).toBeTruthy();
		expect(result.value).toBeInstanceOf(ValidationError);
		expect((result.value as ValidationError).message).toContain("file");
	});

	it("should allow file parameters for Extensions", async () => {
		const service = await createService();
		const validExtensionContent = `
      export default {
        uuid: "valid-extension-uuid",
        name: "Valid Extension",
        description: "Extension with file parameter",
        exposeAction: false,
        exposeExtension: true,
        exposeAITool: false,
        groupsAllowed: [],
        parameters: [
          {
            name: "file",
            type: "file", // Allowed for extensions
            required: false,
            description: "File parameter"
          }
        ],
        returnType: "void",

        run: async (ctx, request) => {
          return new Response("OK");
        }
      };
    `;

		const result = await service.createOrReplace(
			adminAuthContext,
			new File([validExtensionContent], "valid-extension.js", {
				type: "application/javascript",
			}),
		);

		expect(result.isRight()).toBeTruthy();
	});

	it("createOrReplaceFeature should create new feature", async () => {
		const service = await createService();
		const result = await service.createOrReplace(
			adminAuthContext,
			new File([testFeatureContent], "new-feature.js", {
				type: "application/javascript",
			}),
		);

		expect(result.isRight()).toBeTruthy();
		if (result.isRight()) {
			const node = result.value;
			expect(node.uuid).toBe("test-feature-uuid");
		}
	});

	it("createOrReplaceFeature should replace existing feature", async () => {
		const service = await createService();

		// Create initial feature
		const createResult = await service.createOrReplace(
			adminAuthContext,
			new File([testFeatureContent], "feature.js", {
				type: "application/javascript",
			}),
		);
		expect(createResult.isRight()).toBeTruthy();

		// Replace with updated feature
		const updatedContent = testFeatureContent.replace(
			'"Test feature"',
			'"Updated Test feature"',
		);

		const replaceResult = await service.createOrReplace(
			adminAuthContext,
			new File([updatedContent], "feature.js", {
				type: "application/javascript",
			}),
		);
		expect(replaceResult.isRight()).toBeTruthy();
		if (replaceResult.isRight()) {
			const node = replaceResult.value;
			expect(node.uuid).toBe("test-feature-uuid");
		}
	});

	it("should handle feature metadata extraction correctly", async () => {
		const service = await createService();
		const complexFeatureContent = `
      export default {
        uuid: "complex-feature-uuid",
        name: "Complex Feature",
        description: "A feature with complex metadata",
        exposeAction: true,
        runOnCreates: true,
        runOnUpdates: false,
        runManually: true,
        filters: [["mimetype", "==", "text/plain"]],
        exposeExtension: false,
        exposeAITool: false,
        runAs: "system",
        groupsAllowed: ["admins", "editors"],
        parameters: [
          {
            name: "uuids",
            type: "array",
            arrayType: "string",
            required: true,
            description: "Node UUIDs to process"
          },
          {
            name: "config",
            type: "object",
            required: false,
            description: "Configuration object",
            defaultValue: { enabled: true }
          }
        ],
        returnType: "object",
        returnDescription: "Processing result",
        returnContentType: "application/json",

        run: async (ctx, args) => {
          return { processed: args.uuids.length, config: args.config };
        }
      };
    `;

		const result = await service.createOrReplace(
			adminAuthContext,
			new File([complexFeatureContent], "complex-feature.js", {
				type: "application/javascript",
			}),
		);

		expect(result.isRight()).toBeTruthy();

		const getResult = await service.get(
			adminAuthContext,
			"complex-feature-uuid",
		);
		expect(getResult.isRight()).toBeTruthy();

		if (getResult.isRight()) {
			const feature = getResult.value;
			expect(feature.name).toBe("Complex Feature");
			expect(feature.runOnCreates).toBe(true);
			expect(feature.runAs).toBe("system");
			expect(feature.groupsAllowed).toEqual(["admins", "editors"]);
			expect(feature.parameters).toHaveLength(2);
			expect(feature.returnType).toBe("object");
			expect(feature.returnDescription).toBe("Processing result");
		}
	});

	// Tests for multiple subtype exposure
	it("should handle features with multiple subtype exposure", async () => {
		const service = await createService();

		const result = await service.createOrReplace(
			adminAuthContext,
			new File([testMultiSubtypeContent], "multi-subtype.js", {
				type: "application/javascript",
			}),
		);

		expect(result.isRight(), errToMsg(result.value)).toBeTruthy();

		const getResult = await service.get(adminAuthContext, "multi-subtype-uuid");
		expect(getResult.isRight()).toBeTruthy();

		if (getResult.isRight()) {
			const feature = getResult.value;
			expect(feature.exposeAction).toBe(true);
			expect(feature.exposeExtension).toBe(true);
			expect(feature.exposeAITool).toBe(false);
		}
	});

	// Tests for AI Tool specific featureality
	it("should create and validate AI Tool features", async () => {
		const service = await createService();

		const result = await service.createOrReplace(
			adminAuthContext,
			new File([testAIToolContent], "ai-tool.js", {
				type: "application/javascript",
			}),
		);

		expect(result.isRight()).toBeTruthy();

		const getResult = await service.get(adminAuthContext, "test-ai-tool-uuid");
		expect(getResult.isRight()).toBeTruthy();

		if (getResult.isRight()) {
			const feature = getResult.value;
			expect(feature.exposeAITool).toBe(true);
			expect(feature.exposeAction).toBe(false);
			expect(feature.exposeExtension).toBe(false);
			expect(feature.parameters).toHaveLength(2);
		}
	});

	// Test concurrent feature operations
	it("should handle concurrent feature operations", async () => {
		const service = await createService();

		const promises = Array.from({ length: 5 }, (_, i) => {
			const content = testFeatureContent.replace(
				'"test-feature-uuid"',
				`"concurrent-feature-${i}"`,
			).replace(
				'"Test feature"',
				`"Concurrent Feature ${i}"`,
			);

			return service.createOrReplace(
				adminAuthContext,
				new File([content], `concurrent-${i}.js`, {
					type: "application/javascript",
				}),
			);
		});

		const results = await Promise.all(promises);
		results.forEach((result, index) => {
			expect(result.isRight()).toBeTruthy();
			if (result.isRight()) {
				expect(result.value.uuid).toBe(`concurrent-feature-${index}`);
			}
		});
	});

	// Test feature with runtime context
	it("should provide proper runtime context to features", async () => {
		const service = await createService();

		const contextTestContent = `
      export default {
        uuid: "context-test-uuid",
        name: "Context Test Feature",
        description: "Tests runtime context provision.",
        exposeAction: true,
        runManually: true,
        filters: [],
        parameters: [
          {
            name: "uuids",
            type: "array",
            arrayType: "string",
            required: true
          }
        ],
        returnType: "object",

        run: async (ctx, args) => {
          return {
            hasNodeService: !!ctx.nodeService,
            hasAuthContext: !!ctx.authenticationContext,
            userEmail: ctx.authenticationContext.principal.email,
            argsReceived: Object.keys(args)
          };
        }
      };
    `;

		await service.createOrReplace(
			adminAuthContext,
			new File([contextTestContent], "context-test.js", {
				type: "application/javascript",
			}),
		);

		const runResult = await service.runAction(
			adminAuthContext,
			"context-test-uuid",
			["--group-1--"],
			{},
		);

		if (runResult.isLeft()) {
			console.log("Runtime context test error:", runResult.value);
		}
		expect(runResult.isRight()).toBeTruthy();
		if (runResult.isRight()) {
			const result = runResult.value as TestResult;
			expect(result.hasNodeService).toBe(true);
			expect(result.hasAuthContext).toBe(true);
			expect(result.userEmail).toBe("admin@example.com");
			expect(result.argsReceived).toEqual(["uuids"]);
		}
	});

	it("should trigger onCreate action when node is created in folder", async () => {
		const service = await createService();

		// Create action that logs node creation
		const onCreateActionContent = `
      export default {
        uuid: "on-create-action-uuid",
        name: "On Create Action",
        description: "Action triggered on node creation.",
        exposeAction: true,
        runManually: true,
        filters: [],
        parameters: [
          {
            name: "uuids",
            type: "array",
            arrayType: "string",
            required: true
          }
        ],
        returnType: "object",

        run: async (ctx, args) => {
          return { triggered: true, uuids: args.uuids };
        }
      };
    `;

		await service.createOrReplace(
			adminAuthContext,
			new File([onCreateActionContent], "on-create-action.js", {
				type: "application/javascript",
			}),
		);

		// Create folder with onCreate action
		const folderResult = await service.nodeService.create(adminAuthContext, {
			title: "Test Folder",
			mimetype: "application/vnd.antbox.folder",
			onCreate: ["on-create-action-uuid"],
		});

		expect(folderResult.isRight()).toBeTruthy();
		const folder = folderResult.right;

		// Create a node in the folder - should trigger onCreate action
		const nodeResult = await service.nodeService.create(adminAuthContext, {
			title: "Test Node",
			mimetype: "text/plain",
			parent: folder.uuid,
		});

		expect(nodeResult.isRight()).toBeTruthy();
	});

	it("should trigger onUpdate action when node is updated in folder", async () => {
		const service = await createService();

		// Create action that logs node update
		const onUpdateActionContent = `
      export default {
        uuid: "on-update-action-uuid",
        name: "On Update Action",
        description: "Action triggered on node update.",
        exposeAction: true,
        runManually: true,
        filters: [],
        parameters: [
          {
            name: "uuids",
            type: "array",
            arrayType: "string",
            required: true
          }
        ],
        returnType: "object",

        run: async (ctx, args) => {
          return { triggered: true, uuids: args.uuids };
        }
      };
    `;

		await service.createOrReplace(
			adminAuthContext,
			new File([onUpdateActionContent], "on-update-action.js", {
				type: "application/javascript",
			}),
		);

		// Create folder with onUpdate action
		const folderResult = await service.nodeService.create(adminAuthContext, {
			title: "Test Folder",
			mimetype: "application/vnd.antbox.folder",
			onUpdate: ["on-update-action-uuid"],
		});

		expect(folderResult.isRight()).toBeTruthy();
		const folder = folderResult.right;

		// Create a node in the folder
		const nodeResult = await service.nodeService.create(adminAuthContext, {
			title: "Test Node",
			mimetype: "text/plain",
			parent: folder.uuid,
		});

		expect(nodeResult.isRight()).toBeTruthy();
		const node = nodeResult.right;

		// Update the node - should trigger onUpdate action
		const updateResult = await service.nodeService.update(
			adminAuthContext,
			node.uuid,
			{ title: "Updated Node" },
		);

		expect(updateResult.isRight()).toBeTruthy();
	});

	it("should pass additional parameters to onCreate action", async () => {
		const service = await createService();

		// Create action that receives custom parameters
		const paramActionContent = `
      export default {
        uuid: "param-action-uuid",
        name: "Param Action",
        description: "Action with parameters.",
        exposeAction: true,
        runManually: true,
        filters: [],
        parameters: [
          {
            name: "uuids",
            type: "array",
            arrayType: "string",
            required: true
          },
          {
            name: "category",
            type: "string",
            required: false
          },
          {
            name: "priority",
            type: "string",
            required: false
          }
        ],
        returnType: "object",

        run: async (ctx, args) => {
          return {
            triggered: true,
            uuids: args.uuids,
            category: args.category,
            priority: args.priority
          };
        }
      };
    `;

		await service.createOrReplace(
			adminAuthContext,
			new File([paramActionContent], "param-action.js", {
				type: "application/javascript",
			}),
		);

		// Create folder with onCreate action with parameters
		const folderResult = await service.nodeService.create(adminAuthContext, {
			title: "Test Folder",
			mimetype: "application/vnd.antbox.folder",
			onCreate: ["param-action-uuid category=docs priority=high"],
		});

		expect(folderResult.isRight()).toBeTruthy();
		const folder = folderResult.right;

		// Create a node in the folder - should trigger onCreate action with parameters
		const nodeResult = await service.nodeService.create(adminAuthContext, {
			title: "Test Node",
			mimetype: "text/plain",
			parent: folder.uuid,
		});

		expect(nodeResult.isRight()).toBeTruthy();
	});

	it("should handle multiple onCreate actions", async () => {
		const service = await createService();

		// Create first action
		const action1Content = `
      export default {
        uuid: "action-1-uuid",
        name: "Action 1",
        description: "First action.",
        exposeAction: true,
        runManually: true,
        filters: [],
        parameters: [
          {
            name: "uuids",
            type: "array",
            arrayType: "string",
            required: true
          }
        ],
        returnType: "object",

        run: async (ctx, args) => {
          return { action: 1, uuids: args.uuids };
        }
      };
    `;

		// Create second action
		const action2Content = `
      export default {
        uuid: "action-2-uuid",
        name: "Action 2",
        description: "Second action.",
        exposeAction: true,
        runManually: true,
        filters: [],
        parameters: [
          {
            name: "uuids",
            type: "array",
            arrayType: "string",
            required: true
          }
        ],
        returnType: "object",

        run: async (ctx, args) => {
          return { action: 2, uuids: args.uuids };
        }
      };
    `;

		await service.createOrReplace(
			adminAuthContext,
			new File([action1Content], "action-1.js", {
				type: "application/javascript",
			}),
		);

		await service.createOrReplace(
			adminAuthContext,
			new File([action2Content], "action-2.js", {
				type: "application/javascript",
			}),
		);

		// Create folder with multiple onCreate actions
		const folderResult = await service.nodeService.create(adminAuthContext, {
			title: "Test Folder",
			mimetype: "application/vnd.antbox.folder",
			onCreate: ["action-1-uuid", "action-2-uuid"],
		});

		expect(folderResult.isRight()).toBeTruthy();
		const folder = folderResult.right;

		// Create a node in the folder - should trigger both actions
		const nodeResult = await service.nodeService.create(adminAuthContext, {
			title: "Test Node",
			mimetype: "text/plain",
			parent: folder.uuid,
		});

		expect(nodeResult.isRight()).toBeTruthy();
	});
});

const createService = async () => {
	const firstGroupNode: GroupNode = GroupNode.create({
		uuid: "--group-1--",
		title: "The Group",
		owner: "user@gmail.com",
		description: "Group description",
	}).right;

	const secondGroupNode: GroupNode = GroupNode.create({
		uuid: "--group-2--",
		title: "The Group",
		owner: "user@gmail.com",
		description: "Group description",
	}).right;

	const repository = new InMemoryNodeRepository();
	repository.add(firstGroupNode);
	repository.add(secondGroupNode);

	// Add builtin folders
	builtinFolders.forEach((folder) => repository.add(folder));

	const storage = new InMemoryStorageProvider();
	const eventBus = new InMemoryEventBus();

	const nodeService = new NodeService({ repository, storage, bus: eventBus });
	const usersGroupsService = new UsersGroupsService({
		repository,
		storage,
		bus: eventBus,
	});

	await usersGroupsService.createUser(adminAuthContext, {
		email: "admin@example.com",
		name: "Admin",
		groups: [Groups.ADMINS_GROUP_UUID],
	});

	return new FeatureService(nodeService, usersGroupsService);
};

interface TestResult {
	hasNodeService: boolean;
	hasAuthContext: boolean;
	userEmail: string;
	argsReceived: string[];
}

const adminAuthContext: AuthenticationContext = {
	tenant: "default",
	principal: {
		email: "admin@example.com",
		groups: [Groups.ADMINS_GROUP_UUID],
	},
	mode: "Direct",
};

const testFeatureContent = `
  export default {
    uuid: "test-feature-uuid",
    name: "Test feature",
    description: "This is a test feature.",
    exposeAction: true,
    runOnCreates: false,
    runOnUpdates: false,
    runManually: true,
    filters: [],
    exposeExtension: false,
    exposeAITool: false,
    groupsAllowed: ["admins"],
    parameters: [
      {
        name: "uuids",
        type: "array",
        arrayType: "string",
        required: true,
        description: "Node UUIDs to process"
      },
      {
        name: "param1",
        type: "string",
        required: true,
        description: "A test parameter"
      }
    ],
    returnType: "string",
    returnDescription: "The returned string",

    run: async (ctx, args) => {
      return "Hello, " + args.param1;
    }
  };
`;

const testMultiSubtypeContent = `
  export default {
    uuid: "multi-subtype-uuid",
    name: "Multi Subtype Feature",
    description: "A feature exposed as both action and extension.",
    exposeAction: true,
    exposeExtension: true,
    exposeAITool: false,
    runOnCreates: false,
    runOnUpdates: false,
    runManually: true,
    filters: [],
    groupsAllowed: ["admins"],
    parameters: [
      {
        name: "uuids",
        type: "array",
        arrayType: "string",
        required: true,
        description: "Node UUIDs to process"
      },
      {
        name: "message",
        type: "string",
        required: false,
        description: "Optional message"
      }
    ],
    returnType: "object",

    run: async (ctx, args) => {
      return { processed: args.uuids.length, message: args.message || "done" };
    }
  };
`;

const testAIToolContent = `
  export default {
    uuid: "test-ai-tool-uuid",
    name: "Test AI Tool",
    description: "A test AI tool for validation.",
    exposeAction: false,
    exposeExtension: false,
    exposeAITool: true,
    runOnCreates: false,
    runOnUpdates: false,
    runManually: true,
    filters: [],
    groupsAllowed: [],
    parameters: [
      {
        name: "query",
        type: "string",
        required: true,
        description: "Search query"
      },
      {
        name: "limit",
        type: "number",
        required: false,
        description: "Result limit"
      }
    ],
    returnType: "array",

    run: async (ctx, args) => {
      return Array(args.limit || 5).fill({ result: args.query });
    }
  };
`;
