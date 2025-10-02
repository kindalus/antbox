import { describe, test } from "bdd";
import { expect } from "expect";
import { FeatureService } from "./feature_service.ts";
import { NodeService } from "./node_service.ts";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider.ts";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository.ts";
import type { AuthenticationContext } from "./authentication_context.ts";
import { BadRequestError } from "shared/antbox_error.ts";
import { InMemoryEventBus } from "adapters/inmem/inmem_event_bus.ts";
import { UsersGroupsService } from "./users_groups_service.ts";
import { GroupNode } from "domain/users_groups/group_node.ts";
import { builtinFolders } from "application/builtin_folders/index.ts";
import { Groups } from "domain/users_groups/groups.ts";

describe("AI Tool Service Tests", () => {
	test("should list features including AI tools", async () => {
		const service = await createService();

		await service.createOrReplace(
			adminAuthContext,
			new File([testAIToolContent], "test-ai-tool.js", {
				type: "application/javascript",
			}),
		);

		const result = await service.listAITools(adminAuthContext);

		expect(result.isRight()).toBeTruthy();
		if (result.isRight()) {
			const aiTools = result.value;
			expect(aiTools.length).toBeGreaterThan(0);
			const testAITool = aiTools.find((tool) => tool.uuid === "test-ai-tool-uuid");
			expect(testAITool).toBeDefined();
		}
	});

	test("should run AI tool with proper parameters", async () => {
		const service = await createService();

		await service.createOrReplace(
			adminAuthContext,
			new File([testAIToolContent], "test-ai-tool.js", {
				type: "application/javascript",
			}),
		);

		const parameters = {
			input: "Hello World",
			count: 5,
		};

		const result = await service.runAITool(
			adminAuthContext,
			"test-ai-tool-uuid",
			parameters,
		);

		expect(result.isRight()).toBeTruthy();
		if (result.isRight()) {
			const response = result.value;
			expect(response).toEqual({
				processed: "Hello World",
				times: 5,
				timestamp: expect.any(Number),
			});
		}
	});

	test("should return error if AI tool is not found when running", async () => {
		const service = await createService();

		const result = await service.runAITool(
			adminAuthContext,
			"non-existent-uuid",
			{},
		);

		expect(result.isLeft()).toBeTruthy();
	});

	test("should run AI Tool with valid parameters", async () => {
		const service = await createService();

		await service.createOrReplace(
			adminAuthContext,
			new File([testAIToolContent], "test-ai-tool.js", {
				type: "application/javascript",
			}),
		);

		const validParameters = {
			input: "Hello World",
			count: 5,
		};

		const result = await service.runAITool(
			adminAuthContext,
			"test-ai-tool-uuid",
			validParameters,
		);

		expect(result.isRight()).toBeTruthy();
		if (result.isRight()) {
			const response = result.value as any;
			expect(response.processed).toBe("Hello World");
			expect(response.times).toBe(5);
		}
	});

	test("should create AI Tool with valid parameters", async () => {
		const service = await createService();

		const validAIToolContent = `
      export default {
        uuid: "valid-ai-tool-uuid",
        name: "Valid AI Tool",
        description: "AI Tool with valid parameters",
        exposeAction: false,
        exposeExtension: false,
        exposeAITool: true,
        groupsAllowed: [],
        parameters: [
          {
            name: "input",
            type: "string",
            required: true,
            description: "Text input"
          }
        ],
        returnType: "object",

        run: async (context, params) => {
          return { result: params.input };
        }
      };
    `;

		const result = await service.createOrReplace(
			adminAuthContext,
			new File([validAIToolContent], "valid-ai-tool.js", {
				type: "application/javascript",
			}),
		);

		expect(result.isRight()).toBeTruthy();
	});

	test("should create AI Tool with group restrictions", async () => {
		const service = await createService();

		const restrictedAIToolContent = `
      export default {
        uuid: "restricted-ai-tool-uuid",
        name: "Restricted AI Tool",
        description: "AI Tool with group restrictions",
        exposeAction: false,
        exposeExtension: false,
        exposeAITool: true,
        groupsAllowed: ["admins"],
        parameters: [
          {
            name: "input",
            type: "string",
            required: true,
            description: "Text input"
          }
        ],
        returnType: "object",

        run: async (context, params) => {
          return { result: "admin only result", input: params.input };
        }
      };
    `;

		const createResult = await service.createOrReplace(
			adminAuthContext,
			new File([restrictedAIToolContent], "restricted-ai-tool.js", {
				type: "application/javascript",
			}),
		);

		expect(createResult.isRight()).toBeTruthy();

		// Test execution works
		const result = await service.runAITool(
			adminAuthContext,
			"restricted-ai-tool-uuid",
			{ input: "test" },
		);
		expect(result.isRight()).toBeTruthy();
		if (result.isRight()) {
			const response = result.value as any;
			expect(response.result).toBe("admin only result");
			expect(response.input).toBe("test");
		}
	});

	test("should execute AI Tool with proper context and parameters", async () => {
		const service = await createService();

		const contextAwareAIToolContent = `
      export default {
        uuid: "context-aware-ai-tool-uuid",
        name: "Context Aware AI Tool",
        description: "AI Tool that uses context information",
        exposeAction: false,
        exposeExtension: false,
        exposeAITool: true,
        groupsAllowed: [],
        parameters: [
          {
            name: "message",
            type: "string",
            required: true,
            description: "Message to process"
          }
        ],
        returnType: "object",

        run: async (context, params) => {
          return {
            message: params.message,
            user: context.authenticationContext.principal.email,
            tenant: context.authenticationContext.tenant,
            hasNodeService: !!context.nodeService,
            hasUsersGroupsService: !!context.usersGroupsService
          };
        }
      };
    `;

		await service.createOrReplace(
			adminAuthContext,
			new File([contextAwareAIToolContent], "context-aware-ai-tool.js", {
				type: "application/javascript",
			}),
		);

		const result = await service.runAITool(
			adminAuthContext,
			"context-aware-ai-tool-uuid",
			{ message: "Hello AI" },
		);

		expect(result.isRight(), errToMsg(result.value)).toBeTruthy();
		if (result.isRight()) {
			// deno-lint-ignore no-explicit-any
			const response = result.value as any;
			expect(response.message).toBe("Hello AI");
			expect(response.user).toBe("admin@example.com");
			expect(response.tenant).toBe("default");
			expect(response.hasNodeService).toBe(true);
		}
	});

	test("should handle AI Tool with complex parameter validation", async () => {
		const service = await createService();

		const complexAIToolContent = `
      export default {
        uuid: "complex-ai-tool-uuid",
        name: "Complex AI Tool",
        description: "AI Tool with complex parameters",
        exposeAction: false,
        exposeExtension: false,
        exposeAITool: true,
        groupsAllowed: [],
        parameters: [
          {
            name: "strings",
            type: "array",
            arrayType: "string",
            required: true,
            description: "Array of strings"
          },
          {
            name: "numbers",
            type: "array",
            arrayType: "number",
            required: true,
            description: "Array of numbers"
          },
          {
            name: "optional",
            type: "string",
            required: false,
            description: "Optional parameter"
          }
        ],
        returnType: "object",

        run: async (context, params) => {
          return {
            stringCount: params.strings.length,
            numberSum: params.numbers.reduce((a, b) => a + b, 0),
            hasOptional: !!params.optional
          };
        }
      };
    `;

		await service.createOrReplace(
			adminAuthContext,
			new File([complexAIToolContent], "complex-ai-tool.js", {
				type: "application/javascript",
			}),
		);

		// Test with valid parameters
		const validResult = await service.runAITool(
			adminAuthContext,
			"complex-ai-tool-uuid",
			{
				strings: ["hello", "world"],
				numbers: [1, 2, 3],
				optional: "present",
			},
		);

		expect(validResult.isRight()).toBeTruthy();
		if (validResult.isRight()) {
			expect((validResult.value as any).stringCount).toBe(2);
			expect((validResult.value as any).numberSum).toBe(6);
			expect((validResult.value as any).hasOptional).toBe(true);
		}

		// Test without optional parameter
		const validResult2 = await service.runAITool(
			adminAuthContext,
			"complex-ai-tool-uuid",
			{
				strings: ["test"],
				numbers: [10],
			},
		);

		expect(validResult2.isRight()).toBeTruthy();
		if (validResult2.isRight()) {
			expect((validResult2.value as any).stringCount).toBe(1);
			expect((validResult2.value as any).numberSum).toBe(10);
			expect((validResult2.value as any).hasOptional).toBe(false);
		}
	});

	test("should handle AI Tool runtime errors gracefully", async () => {
		const service = await createService();

		const errorAIToolContent = `
      export default {
        uuid: "error-ai-tool-uuid",
        name: "Error AI Tool",
        description: "AI Tool that throws an error",
        exposeAction: false,
        exposeExtension: false,
        exposeAITool: true,
        groupsAllowed: [],
        parameters: [
          {
            name: "shouldError",
            type: "boolean",
            required: true,
            description: "Whether to throw an error"
          }
        ],
        returnType: "object",

        run: async (context, params) => {
          if (params.shouldError) {
            throw new Error("Something went wrong in AI tool");
          }
          return { success: true };
        }
      };
    `;

		await service.createOrReplace(
			adminAuthContext,
			new File([errorAIToolContent], "error-ai-tool.js", {
				type: "application/javascript",
			}),
		);

		// Test error case
		const errorResult = await service.runAITool(
			adminAuthContext,
			"error-ai-tool-uuid",
			{ shouldError: true },
		);

		expect(errorResult.isLeft()).toBeTruthy();
		expect(errorResult.value).toBeInstanceOf(Error);
		expect((errorResult.value as Error).message).toContain("Something went wrong in AI tool");

		// Test success case
		const successResult = await service.runAITool(
			adminAuthContext,
			"error-ai-tool-uuid",
			{ shouldError: false },
		);

		expect(successResult.isRight()).toBeTruthy();
		if (successResult.isRight()) {
			expect((successResult.value as any).success).toBe(true);
		}
	});

	test("should return error for non-existent AI Tool", async () => {
		const service = await createService();

		const result = await service.runAITool(
			adminAuthContext,
			"non-existent-ai-tool-uuid",
			{ input: "test" },
		);

		expect(result.isLeft()).toBeTruthy();
	});

	test("should return error for non-AI Tool Feature", async () => {
		const service = await createService();

		const actionContent = `
      export default {
        uuid: "action-not-ai-tool-uuid",
        name: "Action Not AI Tool",
        description: "This is an action, not an AI tool",
        exposeAction: true,
        exposeExtension: false,
        exposeAITool: false,
        runManually: true,
        filters: [],
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

        run: async (ctx, args) => {
          return { processed: args.uuids.length };
        }
      };
    `;

		await service.createOrReplace(
			adminAuthContext,
			new File([actionContent], "action.js", {
				type: "application/javascript",
			}),
		);

		const result = await service.runAITool(
			adminAuthContext,
			"action-not-ai-tool-uuid",
			{ input: "test" },
		);

		expect(result.isLeft()).toBeTruthy();
		expect(result.value).toBeInstanceOf(BadRequestError);
		expect((result.value as BadRequestError).message).toContain("not exposed as AI tool");
	});

	test("should allow AI Tools with empty groupsAllowed (public access)", async () => {
		const service = await createService();

		const publicAIToolContent = `
      export default {
        uuid: "public-ai-tool-uuid",
        name: "Public AI Tool",
        description: "AI Tool with no group restrictions",
        exposeAction: false,
        exposeExtension: false,
        exposeAITool: true,
        groupsAllowed: [],
        parameters: [
          {
            name: "input",
            type: "string",
            required: true,
            description: "Text input"
          }
        ],
        returnType: "object",

        run: async (context, params) => {
          return { result: "public content", input: params.input };
        }
      };
    `;

		await service.createOrReplace(
			adminAuthContext,
			new File([publicAIToolContent], "public-ai-tool.js", {
				type: "application/javascript",
			}),
		);

		// Test with editor (should succeed)
		const result = await service.runAITool(
			editorAuthContext,
			"public-ai-tool-uuid",
			{ input: "test" },
		);

		expect(result.isRight()).toBeTruthy();
		if (result.isRight()) {
			expect((result.value as any).result).toBe("public content");
			expect((result.value as any).input).toBe("test");
		}
	});

	test("listAITools should return only AI Tools", async () => {
		const service = await createService();

		// Create an AI Tool
		await service.createOrReplace(
			adminAuthContext,
			new File([testAIToolContent], "test-ai-tool.js", {
				type: "application/javascript",
			}),
		);

		// Create an Action (should not appear in AI Tools list)
		const actionContent = `
      export default {
        uuid: "test-action-uuid",
        name: "Test Action",
        description: "This is a test action.",
        exposeAction: true,
        exposeExtension: false,
        exposeAITool: false,
        runManually: true,
        filters: [],
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

        run: async (ctx, args) => {
          return { processed: args.uuids.length };
        }
      };
    `;

		await service.createOrReplace(
			adminAuthContext,
			new File([actionContent], "action.js", {
				type: "application/javascript",
			}),
		);

		// Create an Extension (should not appear in AI Tools list)
		const extensionContent = `
      export default {
        uuid: "test-extension-uuid",
        name: "Test Extension",
        description: "This is a test extension.",
        exposeAction: false,
        exposeExtension: true,
        exposeAITool: false,
        groupsAllowed: [],
        parameters: [],
        returnType: "void",

        run: async (request) => {
          return new Response("Hello from extension", {
            status: 200,
            headers: { "Content-Type": "text/plain" }
          });
        }
      };
    `;

		await service.createOrReplace(
			adminAuthContext,
			new File([extensionContent], "extension.js", {
				type: "application/javascript",
			}),
		);

		const aiToolsResult = await service.listAITools(adminAuthContext);

		expect(aiToolsResult.isRight()).toBeTruthy();
		if (aiToolsResult.isRight()) {
			const aiTools = aiToolsResult.value;
			expect(aiTools.length).toBeGreaterThan(0);

			// Should contain the AI Tool
			const testAITool = aiTools.find((tool) => tool.uuid === "test-ai-tool-uuid");
			expect(testAITool).toBeDefined();
			expect((testAITool as any)?.exposeAITool).toBe(true);

			// Should not contain the Action or Extension
			const testAction = aiTools.find((tool) => tool.uuid === "test-action-uuid");
			expect(testAction).toBeUndefined();

			const testExtension = aiTools.find((tool) => tool.uuid === "test-extension-uuid");
			expect(testExtension).toBeUndefined();
		}
	});

	test("should handle AI Tool execution with all parameters", async () => {
		const service = await createService();

		await service.createOrReplace(
			adminAuthContext,
			new File([testAIToolContent], "test-ai-tool.js", {
				type: "application/javascript",
			}),
		);

		const allParams = {
			input: "Complete test",
			count: 3,
		};

		const result = await service.runAITool(
			adminAuthContext,
			"test-ai-tool-uuid",
			allParams,
		);

		expect(result.isRight()).toBeTruthy();
		if (result.isRight()) {
			const response = result.value as any;
			expect(response.processed).toBe("Complete test");
			expect(response.times).toBe(3);
			expect(typeof response.timestamp).toBe("number");
		}
	});

	test("should handle AI Tool with no parameters", async () => {
		const service = await createService();

		const noParamsAIToolContent = `
      export default {
        uuid: "no-params-ai-tool-uuid",
        name: "No Params AI Tool",
        description: "AI Tool with no parameters",
        exposeAction: false,
        exposeExtension: false,
        exposeAITool: true,
        groupsAllowed: [],
        parameters: [],
        returnType: "object",

        run: async (context, params) => {
          return {
            message: "No parameters needed",
            timestamp: Date.now()
          };
        }
      };
    `;

		await service.createOrReplace(
			adminAuthContext,
			new File([noParamsAIToolContent], "no-params-ai-tool.js", {
				type: "application/javascript",
			}),
		);

		const result = await service.runAITool(
			adminAuthContext,
			"no-params-ai-tool-uuid",
			{},
		);

		expect(result.isRight()).toBeTruthy();
		if (result.isRight()) {
			expect((result.value as any).message).toBe("No parameters needed");
			expect(typeof (result.value as any).timestamp).toBe("number");
		}
	});
});

// === Helper Functions and Constants ===

const createService = async () => {
	const firstGroupNode: GroupNode = GroupNode.create({
		uuid: "--group-1--",
		title: "Editors Group",
		owner: "user@gmail.com",
		description: "Group description",
	}).right;

	const secondGroupNode: GroupNode = GroupNode.create({
		uuid: "--group-2--",
		title: "Users Group",
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

	await usersGroupsService.createUser(adminAuthContext, {
		email: "editor@example.com",
		name: "Editor",
		groups: ["--group-1--"],
	});

	return new FeatureService(nodeService, usersGroupsService);
};

const adminAuthContext: AuthenticationContext = {
	mode: "Direct",
	tenant: "default",
	principal: {
		email: "admin@example.com",
		groups: [Groups.ADMINS_GROUP_UUID],
	},
};

const editorAuthContext: AuthenticationContext = {
	mode: "Direct",
	tenant: "default",
	principal: {
		email: "editor@example.com",
		groups: ["--group-1--"],
	},
};

const testAIToolContent = `
  export default {
    uuid: "test-ai-tool-uuid",
    name: "Test AI Tool",
    description: "This is a test AI tool.",
    exposeAction: false,
    exposeExtension: false,
    exposeAITool: true,
    groupsAllowed: [],
    parameters: [
      {
        name: "input",
        type: "string",
        required: true,
        description: "Text input to process"
      },
      {
        name: "count",
        type: "number",
        required: true,
        description: "Number of times to process"
      }
    ],
    returnType: "object",

    run: async (context, params) => {
      return {
        processed: params.input,
        times: params.count,
        timestamp: Date.now()
      };
    }
  };
`;

const errToMsg = (
	err: any,
) => (err?.message ? err.message : JSON.stringify(err));
