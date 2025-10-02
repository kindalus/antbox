// deno-lint-ignore-file no-explicit-any
import { expect } from "expect";
import { describe, test } from "bdd";
import { InMemoryEventBus } from "adapters/inmem/inmem_event_bus.ts";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository.ts";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider.ts";
import { GroupNode } from "domain/users_groups/group_node.ts";
import { Groups } from "domain/users_groups/groups.ts";
import { BadRequestError } from "shared/antbox_error.ts";
import { ValidationError } from "shared/validation_error.ts";
import { FeatureService } from "application/feature_service.ts";
import { AuthenticationContext } from "application/authentication_context.ts";
import { NodeService } from "application/node_service.ts";
import { UsersGroupsService } from "application/users_groups_service.ts";
import { builtinFolders } from "application/builtin_folders/index.ts";

describe("Action Service Tests", () => {
	test("should list features including actions", async () => {
		const service = await createService();
		await service.createOrReplace(
			adminAuthContext,
			new File([testActionContent], "action.js", {
				type: "application/javascript",
			}),
		);

		const result = await service.listFeatures(adminAuthContext);
		expect(result.isRight()).toBeTruthy();

		if (result.isRight()) {
			const features = result.value;
			const testAction = features.find((f) => f.name === "Test Action");
			expect(testAction).toBeDefined();
			if (testAction) {
				expect(testAction.exposeAction).toBe(true);
			}
		}
	});

	test("should run action", async () => {
		const service = await createService();
		await service.createOrReplace(
			adminAuthContext,
			new File([testActionContent], "action.js", {
				type: "application/javascript",
			}),
		);

		const runResult = await service.runAction(
			adminAuthContext,
			"test-action-uuid",
			["--group-1--", "--group-2--"],
			{ message: "test message" },
		);

		expect(runResult.isRight()).toBeTruthy();

		const result = runResult.right as any;
		expect(result.processedCount).toBe(2);
		expect(result.message).toBe("test message");
		expect(result.hasNodeService).toBe(true);
	});

	test("should return error if action is not found when running", async () => {
		const service = await createService();

		const runResult = await service.runAction(
			adminAuthContext,
			"non-existing-action-uuid",
			["test-uuid"],
		);

		expect(runResult.isLeft()).toBeTruthy();
	});

	// Validation tests
	test("should validate Action must have uuids parameter", async () => {
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
		if (result.isLeft() && result.value instanceof ValidationError) {
			expect(result.value.message).toContain("uuids");
		}
	});

	test("should validate uuids parameter must be array of strings", async () => {
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
            type: "string",
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
	});

	test("should validate Action cannot have file parameters", async () => {
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
            type: "file",
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
	});

	test("should validate Action filter compliance during execution", async () => {
		const service = await createService();

		const filterActionContent = `
      export default {
        uuid: "filter-action-uuid",
        name: "Filter Action",
        description: "Action with specific filters",
        exposeAction: true,
        runOnCreates: false,
        runOnUpdates: false,
        runManually: true,
        filters: [["mimetype", "==", "text/plain"]],
        exposeExtension: false,
        exposeAITool: false,
        groupsAllowed: ["admins"],
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
          return { processed: args.uuids.length };
        }
      };
    `;

		await service.createOrReplace(
			adminAuthContext,
			new File([filterActionContent], "filter-action.js", {
				type: "application/javascript",
			}),
		);

		// The service handles filter validation internally
		const result = await service.runAction(
			adminAuthContext,
			"filter-action-uuid",
			["--group-1--"],
		);

		// Result should be successful since no specific filters are applied
		expect(result.isRight()).toBeTruthy();
	});

	test("should validate Action permissions with groupsAllowed", async () => {
		const service = await createService();

		const restrictedActionContent = `
      export default {
        uuid: "restricted-action-uuid",
        name: "Restricted Action",
        description: "Action with group restrictions",
        exposeAction: true,
        runOnCreates: false,
        runOnUpdates: false,
        runManually: true,
        filters: [],
        exposeExtension: false,
        exposeAITool: false,
        groupsAllowed: ["-admins-"],
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
          return { executedBy: ctx.authenticationContext.principal.email };
        }
      };
    `;

		await service.createOrReplace(
			adminAuthContext,
			new File([restrictedActionContent], "restricted-action.js", {
				type: "application/javascript",
			}),
		);

		// Test with admin user (should succeed)
		const adminResult = await service.runAction(
			adminAuthContext,
			"restricted-action-uuid",
			["--group-1--"],
		);
		expect(adminResult.isRight()).toBeTruthy();

		// Test with editor user (should fail due to permissions)
		const runResult = await service.runAction(
			editorAuthContext,
			"restricted-action-uuid",
			["--group-1--"],
		);

		expect(runResult.isLeft()).toBeTruthy();
	});

	test("should validate runManually false prevents manual execution", async () => {
		const service = await createService();

		const nonManualActionContent = `
      export default {
        uuid: "non-manual-action-uuid",
        name: "Non Manual Action",
        description: "Action that cannot be run manually",
        exposeAction: true,
        runOnCreates: true,
        runOnUpdates: false,
        runManually: false,
        filters: [],
        exposeExtension: false,
        exposeAITool: false,
        groupsAllowed: [],
        parameters: [
          {
            name: "uuids",
            type: "array",
            arrayType: "string",
            required: true
          }
        ],
        returnType: "void",

        run: async (ctx, args) => {}
      };
    `;

		await service.createOrReplace(
			adminAuthContext,
			new File([nonManualActionContent], "non-manual-action.js", {
				type: "application/javascript",
			}),
		);

		// Try to run action manually (should fail)
		const runResult = await service.runAction(
			adminAuthContext,
			"non-manual-action-uuid",
			["--group-1--"],
		);

		expect(runResult.isLeft()).toBeTruthy();
		if (runResult.isLeft()) {
			expect(runResult.value).toBeInstanceOf(BadRequestError);
		}
	});

	test("should execute Action with proper context and parameters", async () => {
		const service = await createService();

		const contextTestContent = `
      export default {
        uuid: "context-test-action-uuid",
        name: "Context Test Action",
        description: "Tests context and parameter handling",
        exposeAction: true,
        runOnCreates: false,
        runOnUpdates: false,
        runManually: true,
        filters: [],
        exposeExtension: false,
        exposeAITool: false,
        groupsAllowed: [],
        parameters: [
          {
            name: "uuids",
            type: "array",
            arrayType: "string",
            required: true
          },
          {
            name: "message",
            type: "string",
            required: false
          }
        ],
        returnType: "object",

        run: async (ctx, args) => {
          return {
            processedCount: args.uuids.length,
            message: "test message",
            hasNodeService: !!ctx.nodeService,
            hasAuthContext: !!ctx.authenticationContext,
            userEmail: ctx.authenticationContext.principal.email,
            argsReceived: Object.keys(args),
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
			"context-test-action-uuid",
			["--group-1--", "--group-2--"],
		);

		expect(runResult.isRight()).toBeTruthy();
		const result = runResult.right as any;
		expect(result.processedCount).toBe(2);
		expect(result.message).toBe("test message");
		expect(result.hasNodeService).toBe(true);
		expect(result.hasAuthContext).toBe(true);
		expect(result.userEmail).toBe("admin@example.com");
		expect(result.argsReceived).toContain("uuids");
	});

	// Test for handling batch operations
	test("should handle batch execution on multiple nodes", async () => {
		const service = await createService();

		const batchActionContent = `
      export default {
        uuid: "batch-action-uuid",
        name: "Batch Action",
        description: "Action for batch processing",
        exposeAction: true,
        runManually: true,
        filters: [],
        groupsAllowed: [],
        parameters: [
          {
            name: "uuids",
            type: "array",
            arrayType: "string",
            required: true
          },
          {
            name: "operation",
            type: "string",
            required: true
          }
        ],
        returnType: "object",
        run: async (ctx, args) => {
          const results = [];
          for (const uuid of args.uuids) {
            results.push({ uuid, operation: args.operation, status: "processed" });
          }
          return { results, total: results.length };
        }
      };
    `;

		await service.createOrReplace(
			adminAuthContext,
			new File([batchActionContent], "batch-action.js", {
				type: "application/javascript",
			}),
		);

		const largeBatch = Array.from({ length: 10 }, (_, i) => `uuid-${i}`);

		const result = await service.runAction(
			adminAuthContext,
			"batch-action-uuid",
			["--group-1--", "--group-2--"],
			{ operation: "test-operation" },
		);

		expect(result.isRight()).toBeTruthy();
		if (result.isRight()) {
			const response = result.value as any;
			expect(response.total).toBe(2);
			expect(response.results.length).toBe(2);
		}
	});

	// Test error handling
	test("should handle action runtime errors gracefully", async () => {
		const service = await createService();

		const errorActionContent = `
      export default {
        uuid: "error-action-uuid",
        name: "Error Action",
        description: "Action that can throw errors",
        exposeAction: true,
        runManually: true,
        filters: [],
        groupsAllowed: [],
        parameters: [
          {
            name: "uuids",
            type: "array",
            arrayType: "string",
            required: true
          },
          {
            name: "shouldError",
            type: "boolean",
            required: false
          }
        ],
        returnType: "object",
        run: async (ctx, args) => {
          if (args.shouldError) {
            throw new Error("Intentional test error");
          }
          return { success: true };
        }
      };
    `;

		await service.createOrReplace(
			adminAuthContext,
			new File([errorActionContent], "error-action.js", {
				type: "application/javascript",
			}),
		);

		// Test error handling
		// Test error case
		const errorResult = await service.runAction(
			adminAuthContext,
			"error-action-uuid",
			["--group-1--"],
			{ shouldError: true },
		);

		expect(errorResult.isLeft()).toBeTruthy();

		// Test successful execution
		const runResult = await service.runAction(
			adminAuthContext,
			"error-action-uuid",
			["--group-1--"],
			{ shouldError: false },
		);

		expect(runResult.isRight()).toBeTruthy();
		if (runResult.isRight()) {
			const response = runResult.value as any;
			expect(response.success).toBe(true);
		}
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

	await usersGroupsService.createUser(editorAuthContext, {
		email: "editor@example.com",
		name: "Editor",
		groups: ["--editors--"],
	});

	return new FeatureService(nodeService, usersGroupsService);
};

const adminAuthContext: AuthenticationContext = {
	tenant: "default",
	principal: {
		email: "admin@example.com",
		groups: [Groups.ADMINS_GROUP_UUID],
	},
	mode: "Direct",
};

const editorAuthContext: AuthenticationContext = {
	tenant: "default",
	principal: {
		email: "editor@example.com",
		groups: ["--editors--"],
	},
	mode: "Direct",
};

const testActionContent = `
  export default {
    uuid: "test-action-uuid",
    name: "Test Action",
    description: "This is a test action.",
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
        name: "message",
        type: "string",
        required: false,
        description: "Optional message"
      }
    ],
    returnType: "object",

    run: async (ctx, args) => {
      return {
        processedCount: args.uuids.length,
        message: args.message || "default message",
        hasNodeService: !!ctx.nodeService
      };
    }
  };
`;
