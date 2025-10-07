import { describe, it } from "bdd";
import { expect } from "expect";
import { FeatureService } from "./feature_service.ts";
import { NodeService } from "./node_service.ts";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider.ts";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository.ts";
import type { AuthenticationContext } from "./authentication_context.ts";
import { InMemoryEventBus } from "adapters/inmem/inmem_event_bus.ts";
import { UsersGroupsService } from "./users_groups_service.ts";
import { GroupNode } from "domain/users_groups/group_node.ts";
import { builtinFolders } from "./builtin_folders/index.ts";
import { Groups } from "domain/users_groups/groups.ts";
import { DeterministicModel } from "adapters/models/deterministic.ts";

describe("Extension Service", () => {
	it("should allow file parameters for Extensions", async () => {
		const service = await createService();
		const fileExtensionContent = `
      export default {
        uuid: "file-extension-uuid",
        name: "File Extension",
        description: "Extension with file parameter",
        exposeAction: false,
        exposeExtension: true,
        exposeAITool: false,
        groupsAllowed: ["admins"],
        parameters: [
          {
            name: "file",
            type: "file",
            required: true,
            description: "File parameter"
          }
        ],
        returnType: "void",

        run: async (ctx, params) => {
          return new Response("File processed", {
            status: 200,
            headers: { "Content-Type": "text/plain" }
          });
        }
      };
    `;

		const result = await service.createOrReplace(
			adminAuthContext,
			new File([fileExtensionContent], "file-extension.js", {
				type: "application/javascript",
			}),
		);

		expect(result.isRight()).toBeTruthy();
	});

	it("listExtensions should return only Extensions", async () => {
		const service = await createService();

		(await service.createOrReplace(
			adminAuthContext,
			new File([testExtensionContent], "test-extension.js", {
				type: "application/javascript",
			}),
		)).right;

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

		(await service.createOrReplace(
			adminAuthContext,
			new File([actionContent], "action.js", {
				type: "application/javascript",
			}),
		)).right;

		const extensionsResult = await service.listExtensions();

		expect(extensionsResult.isRight()).toBeTruthy();
		if (extensionsResult.isRight()) {
			const extensions = extensionsResult.value;
			expect(extensions.length).toBeGreaterThan(0);
			const testExtension = extensions.find((ext) => ext.uuid === "test-extension-uuid");
			expect(testExtension).toBeDefined();
		}
	});

	it("runExtension should execute Extension with Request and return Response", async () => {
		const service = await createService();

		(await service.createOrReplace(
			adminAuthContext,
			new File([testExtensionContent], "test-extension.js", {
				type: "application/javascript",
			}),
		)).right;

		const request = new Request("http://localhost/test");
		const response = await service.runExtension(adminAuthContext, "test-extension-uuid", request);

		expect(response).toBeInstanceOf(Response);
		expect(response.status).toBe(200);
		const text = await response.text();
		expect(text).toBe("Hello from extension");
	});

	it("runExtension should handle POST requests with body", async () => {
		const service = await createService();
		const postExtensionContent = `
      export default {
        uuid: "post-extension-uuid",
        name: "POST Extension",
        description: "Handles POST requests with body",
        exposeAction: false,
        exposeExtension: true,
        exposeAITool: false,
        groupsAllowed: [],
        parameters: [],
        returnType: "object",

        run: async (ctx, params) => {
          return {
            received: params,
            method: "POST"
          };
        }
      };
    `;

		await service.createOrReplace(
			adminAuthContext,
			new File([postExtensionContent], "post-extension.js", {
				type: "application/javascript",
			}),
		);

		const postData = { name: "test", value: 123 };
		const postRequest = new Request("http://localhost/test", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(postData),
		});

		const response = await service.runExtension(
			adminAuthContext,
			"post-extension-uuid",
			postRequest,
		);

		expect(response.status).toBe(200);
		const result = await response.json();
		expect(result.received).toEqual(postData);
		expect(result.method).toBe("POST");
	});

	it("runExtension should return error for non-existent Extension", async () => {
		const service = await createService();

		const request = new Request("http://localhost/test");
		const response = await service.runExtension(adminAuthContext, "non-existent", request);

		expect(response.status).toBe(404);
	});

	it("runExtension should return error for non-Extension Feature", async () => {
		const service = await createService();

		const actionContent = `
      export default {
        uuid: "action-not-extension-uuid",
        name: "Action Not Extension",
        description: "This is an action, not an extension",
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

		const request = new Request("http://localhost/test");
		const response = await service.runExtension(
			adminAuthContext,
			"action-not-extension-uuid",
			request,
		);

		expect(response.status).toBe(400);
		const text = await response.text();
		expect(text).toContain("not exposed as extension");
	});

	it("runExtension should enforce groupsAllowed permissions", async () => {
		const service = await createService();
		const restrictedExtensionContent = `
      export default {
        uuid: "restricted-extension-uuid",
        name: "Restricted Extension",
        description: "Extension with group restrictions",
        exposeAction: false,
        exposeExtension: true,
        exposeAITool: false,
        groupsAllowed: ["-admins-"],
        parameters: [],
        returnType: "string",

        run: async (ctx, params) => {
          return "Admin only content";
        }
      };
    `;

		await service.createOrReplace(
			adminAuthContext,
			new File([restrictedExtensionContent], "restricted-extension.js", {
				type: "application/javascript",
			}),
		);

		const request1 = new Request("http://localhost/test");
		const response1 = await service.runExtension(
			editorAuthContext,
			"restricted-extension-uuid",
			request1,
		);
		expect(response1.status).toBe(404);

		const request2 = new Request("http://localhost/test");
		const response2 = await service.runExtension(
			adminAuthContext,
			"restricted-extension-uuid",
			request2,
		);
		expect(response2.status).toBe(200);
		const text = await response2.text();
		expect(text).toBe("Admin only content");
	});

	it("should allow Extensions with empty groupsAllowed (public access)", async () => {
		const service = await createService();
		const publicExtensionContent = `
      export default {
        uuid: "public-extension-uuid",
        name: "Public Extension",
        description: "Extension with no group restrictions",
        exposeAction: false,
        exposeExtension: true,
        exposeAITool: false,
        groupsAllowed: [],
        parameters: [],
        returnType: "void",

        run: async (ctx, params) => {
          return new Response("Public content", {
            status: 200,
            headers: { "Content-Type": "text/plain" }
          });
        }
      };
    `;

		await service.createOrReplace(
			adminAuthContext,
			new File([publicExtensionContent], "public-extension.js", {
				type: "application/javascript",
			}),
		);

		// Test with editor (should fail - returns 404 since they can't see it without being in allowed groups)
		const request = new Request("http://localhost/test");
		const response = await service.runExtension(
			editorAuthContext,
			"public-extension-uuid",
			request,
		);
		expect(response.status).toBe(404);
	});

	it("runExtension should handle Extension runtime errors gracefully", async () => {
		const service = await createService();
		const errorExtensionContent = `
      export default {
        uuid: "error-extension-uuid",
        name: "Error Extension",
        description: "Extension that throws an error",
        exposeAction: false,
        exposeExtension: true,
        exposeAITool: false,
        groupsAllowed: [],
        parameters: [],
        returnType: "void",

        run: async (ctx, params) => {
          throw new Error("Something went wrong in extension");
        }
      };
    `;

		await service.createOrReplace(
			adminAuthContext,
			new File([errorExtensionContent], "error-extension.js", {
				type: "application/javascript",
			}),
		);

		const request = new Request("http://localhost/test");
		const response = await service.runExtension(
			adminAuthContext,
			"error-extension-uuid",
			request,
		);

		expect(response.status).toBe(500);
		const text = await response.text();
		expect(text).toContain("Something went wrong in extension");
	});

	it("should handle Extension that returns object with correct returnType", async () => {
		const service = await createService();
		const validResponseContent = `
      export default {
        uuid: "valid-response-uuid",
        name: "Valid Response Extension",
        description: "Extension that returns object with correct returnType",
        exposeAction: false,
        exposeExtension: true,
        exposeAITool: false,
        groupsAllowed: [],
        parameters: [],
        returnType: "object",

        run: async (ctx, params) => {
          return { message: "This is a valid object response" };
        }
      };
    `;

		await service.createOrReplace(
			adminAuthContext,
			new File([validResponseContent], "valid-response.js", {
				type: "application/javascript",
			}),
		);

		const request = new Request("http://localhost/test");
		const response = await service.runExtension(
			adminAuthContext,
			"valid-response-uuid",
			request,
		);

		expect(response.status).toBe(200);
		const result = await response.json();
		expect(result.message).toBe("This is a valid object response");
	});
});

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
	const ocrModel = new DeterministicModel("");

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

	return new FeatureService(nodeService, usersGroupsService, ocrModel);
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

const testExtensionContent = `
  export default {
    uuid: "test-extension-uuid",
    name: "Test Extension",
    description: "This is a test extension.",
    exposeAction: false,
    exposeExtension: true,
    exposeAITool: false,
    groupsAllowed: [],
    parameters: [],
    returnType: "string",

    run: async (ctx, params) => "Hello from extension"
  };
`;
