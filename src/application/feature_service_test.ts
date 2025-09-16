import { expect } from "expect/expect";
import { describe, test } from "bdd";
import { InMemoryEventBus } from "adapters/inmem/inmem_event_bus.ts";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository.ts";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider.ts";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";
import { GroupNode } from "domain/users_groups/group_node.ts";
import { Groups } from "domain/users_groups/groups.ts";
import { BadRequestError } from "shared/antbox_error.ts";
import { FeatureService } from "application/feature_service.ts";
import { FeatureNotFoundError } from "domain/features/feature_not_found_error.ts";
import { AuthenticationContext } from "application/authentication_context.ts";
import { NodeService } from "application/node_service.ts";
import { UsersGroupsService } from "application/users_groups_service.ts";
import { builtinFolders } from "application/builtin_folders/index.ts";

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

const adminAuthContext: AuthenticationContext = {
  mode: "Direct",
  tenant: "default",
  principal: {
    email: "admin@example.com",
    groups: [Groups.ADMINS_GROUP_UUID],
  },
};

const testFunctionContent = `
  export default {
    uuid: "test-function-uuid",
    name: "Test Function",
    description: "This is a test function.",
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

describe("FeatureService", () => {
  test("create should create a new function", async () => {
    const service = await createService();
    const file = new File([testFunctionContent], "function.js", {
      type: "application/javascript",
    });

    const functionOrErr = await service.create(adminAuthContext, file);

    expect(functionOrErr.isRight(), errToMsg(functionOrErr.value)).toBeTruthy();
    expect(functionOrErr.right.id).toBe("test-function-uuid");
    expect(functionOrErr.right.name).toBe("Test Function");
    expect(functionOrErr.right.description).toBe("This is a test function.");
    expect(functionOrErr.right.exposeAction).toBe(true);
    expect(functionOrErr.right.returnType).toBe("string");
    expect(functionOrErr.right.parameters.length).toBe(1);
    expect(functionOrErr.right.parameters[0].name).toBe("param1");
  });

  test("update should replace existing function", async () => {
    const service = await createService();
    await service.create(
      adminAuthContext,
      new File([testFunctionContent], "function.js", {
        type: "application/javascript",
      }),
    );

    const newFileContent = `
      export default {
        uuid: "test-function-uuid",
        name: "Updated Function Name",
        description: "Updated description",
        exposeAction: false,
        runOnCreates: false,
        runOnUpdates: false,
        runManually: true,
        filters: [],
        exposeExtension: true,
        exposeAITool: false,
        groupsAllowed: ["admins"],
        parameters: [
          {
            name: "param1",
            type: "string",
            required: true,
            description: "A test parameter"
          },
          {
            name: "param2",
            type: "number",
            required: false,
            description: "Another parameter"
          }
        ],
        returnType: "object",
        returnDescription: "A result object",

        run: async (ctx, args) => {
          return { message: "Hello, " + args.param1, value: args.param2 };
        }
      };
    `;
    const funcOrErr = await service.updateFile(
      adminAuthContext,
      "test-function-uuid",
      new File([newFileContent], "function.js", {
        type: "application/javascript",
      }),
    );

    expect(funcOrErr.isRight(), errToMsg(funcOrErr.value)).toBeTruthy();
    expect(funcOrErr.right.id).toBe("test-function-uuid");
    expect(funcOrErr.right.name).toBe("Updated Function Name");
    expect(funcOrErr.right.description).toBe("Updated description");
    expect(funcOrErr.right.exposeAction).toBe(false);
    expect(funcOrErr.right.exposeExtension).toBe(true);
    expect(funcOrErr.right.returnType).toBe("object");
    expect(funcOrErr.right.parameters.length).toBe(2);
  });

  test("get should return function", async () => {
    const service = await createService();
    await service.create(
      adminAuthContext,
      new File([testFunctionContent], "function.js", {
        type: "application/javascript",
      }),
    );

    const functionOrErr = await service.get(
      adminAuthContext,
      "test-function-uuid",
    );

    expect(functionOrErr.isRight(), errToMsg(functionOrErr.value)).toBeTruthy();
    expect(functionOrErr.right.id).toBe("test-function-uuid");
    expect(functionOrErr.right.name).toBe("Test Function");
    expect(functionOrErr.right.description).toBe("This is a test function.");
  });

  test("get should return error if function does not exist", async () => {
    const service = await createService();

    const functionOrErr = await service.get(
      adminAuthContext,
      "non-existing-function-uuid",
    );

    expect(functionOrErr.isLeft()).toBeTruthy();
    expect(functionOrErr.value).toBeInstanceOf(NodeNotFoundError);
  });

  test("get should return error if node is not a function", async () => {
    const service = await createService();

    const functionOrErr = await service.get(adminAuthContext, "--group-1--");

    expect(functionOrErr.isLeft()).toBeTruthy();
    expect(functionOrErr.value).toBeInstanceOf(FeatureNotFoundError);
  });

  test("delete should remove function", async () => {
    const service = await createService();
    await service.create(
      adminAuthContext,
      new File([testFunctionContent], "function.js", {
        type: "application/javascript",
      }),
    );

    const deleteResult = await service.delete(
      adminAuthContext,
      "test-function-uuid",
    );

    expect(deleteResult.isRight(), errToMsg(deleteResult.value)).toBeTruthy();

    const getFunctionResult = await service.get(
      adminAuthContext,
      "test-function-uuid",
    );
    expect(getFunctionResult.isLeft()).toBeTruthy();
    expect(getFunctionResult.value).toBeInstanceOf(NodeNotFoundError);
  });

  test("list should return all functions", async () => {
    const service = await createService();
    await service.create(
      adminAuthContext,
      new File([testFunctionContent], "function1.js", {
        type: "application/javascript",
      }),
    );

    const secondFunctionContent = testFunctionContent.replace(
      "test-function-uuid",
      "second-function-uuid",
    ).replace(
      "Test Function",
      "Second Function",
    );

    await service.create(
      adminAuthContext,
      new File([secondFunctionContent], "function2.js", {
        type: "application/javascript",
      }),
    );

    const functions = await service.list(adminAuthContext);

    expect(functions.isRight(), errToMsg(functions.value)).toBeTruthy();
    expect(functions.right.length).toBe(2);
    expect(functions.right.some((f) => f.id === "test-function-uuid"))
      .toBeTruthy();
    expect(functions.right.some((f) => f.id === "second-function-uuid"))
      .toBeTruthy();
  });

  test("export should create a JavaScript file containing function", async () => {
    const service = await createService();
    await service.create(
      adminAuthContext,
      new File([testFunctionContent], "function.js", {
        type: "application/javascript",
      }),
    );

    const fileOrErr = await service.export(
      adminAuthContext,
      "test-function-uuid",
    );

    expect(fileOrErr.isRight(), errToMsg(fileOrErr.value)).toBeTruthy();
    expect(fileOrErr.right.name).toBe("Test Function");
    expect(fileOrErr.right.type.startsWith("application/javascript"))
      .toBeTruthy();
  });

  test("run should execute the function and return result", async () => {
    const service = await createService();
    await service.create(
      adminAuthContext,
      new File([testFunctionContent], "function.js", {
        type: "application/javascript",
      }),
    );

    const runResult = await service.run(
      adminAuthContext,
      "test-function-uuid",
      {
        param1: "World",
      },
    );

    expect(runResult.isRight(), errToMsg(runResult.value)).toBeTruthy();
    expect((runResult as any).value).toBe("Hello World");
  });

  test("run should return error if parameter validation fails", async () => {
    const service = await createService();
    const functionWithValidationContent = `
      export default {
        uuid: "validation-function-uuid",
        name: "Validation Function",
        description: "This function validates parameters",
        exposeAction: true,
        runManually: true,
        filters: [],
        exposeExtension: false,
        exposeMCP: false,
        groupsAllowed: ["admins"],
        parameters: [
          {
            name: "requiredParam",
            type: "string",
            required: true
          }
        ],
        returnType: "string",

        run: async (ctx, args) => {
          if (!args.requiredParam) {
            throw new Error("Required parameter missing");
          }
          return "Success";
        }
      };
    `;

    await service.create(
      adminAuthContext,
      new File([functionWithValidationContent], "validation.js", {
        type: "application/javascript",
      }),
    );

    const runResult = await service.run(
      adminAuthContext,
      "validation-function-uuid",
      {},
    );

    expect(runResult.isLeft()).toBeTruthy();
    expect((runResult.value as any).message).toContain(
      "Required parameter missing",
    );
  });

  test("run should return error if function cannot be run manually", async () => {
    const service = await createService();
    const notManuallyRunnableFunction = `
      export default {
        uuid: "automatic-function-uuid",
        name: "Automatic Function",
        description: "This function can't be run manually",
        exposeAction: false,
        runOnCreates: true,
        runOnUpdates: false,
        runManually: false,
        filters: [],
        exposeExtension: false,
        exposeMCP: false,
        groupsAllowed: ["admins"],
        parameters: [],
        returnType: "void",

        run: async (ctx, args) => {
          console.log("Running automatically");
        }
      };
    `;

    await service.create(
      adminAuthContext,
      new File([notManuallyRunnableFunction], "automatic.js", {
        type: "application/javascript",
      }),
    );

    const runResult = await service.run(
      adminAuthContext,
      "automatic-function-uuid",
      {},
    );

    expect(runResult.isLeft()).toBeTruthy();
    expect(runResult.value).toBeInstanceOf(BadRequestError);
    expect((runResult.value as any).message).toBe(
      "Feature cannot be run manually",
    );
  });
});

const errToMsg = (err: unknown): string => {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
};
