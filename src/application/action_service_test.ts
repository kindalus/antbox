import { expect } from "expect/expect";
import { describe, test } from "bdd";
import { InMemoryEventBus } from "adapters/inmem/inmem_event_bus.ts";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository.ts";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider.ts";
import { ActionNode } from "domain/actions/action_node.ts";
import { NodeCreatedEvent } from "domain/nodes/node_created_event.ts";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";
import { NodeUpdatedEvent } from "domain/nodes/node_updated_event.ts";
import { GroupNode } from "domain/users_groups/group_node.ts";
import { Groups } from "domain/users_groups/groups.ts";
import { BadRequestError } from "shared/antbox_error.ts";
import { ActionService } from "application/skill_service.ts";
import { AuthenticationContext } from "application/authentication_context.ts";
import { NodeService } from "application/node_service.ts";
import { UsersGroupsService } from "application/users_groups_service.ts";

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

  return new ActionService(nodeService, usersGroupsService);
};

const adminAuthContext: AuthenticationContext = {
  mode: "Action",
  tenant: "default",
  principal: {
    email: "admin@example.com",
    groups: [Groups.ADMINS_GROUP_UUID],
  },
};

const testFileContent = `
  export default {
    uuid: "test-action-uuid",
    title: "Test Action",
    description: "This is a test action.",
    builtIn: false,
    runOnCreates: true,
    runOnUpdates: false,
    runManually: true,
    params: [],
    filters: [],
    groupsAllowed: ["admins"],

    run: async (ctx, uuids, params) => {
      console.log("The Action is running...");
    }
  };
`;

describe("ActionService", () => {
  test("createOrReplace should create a new action", async () => {
    const service = await createService();
    const file = new File([testFileContent], "action.js", {
      type: "application/javascript",
    });

    const actionOrErr = await service.createOrReplace(adminAuthContext, file);

    expect(actionOrErr.isRight(), errToMsg(actionOrErr.value)).toBeTruthy();
    expect(actionOrErr.right.uuid).toBe("test-action-uuid");
    expect(actionOrErr.right.title).toBe("Test Action");
    expect(actionOrErr.right.description).toBe("This is a test action.");
  });

  test("createOrReplace should replace existing action", async () => {
    const service = await createService();
    await service.createOrReplace(
      adminAuthContext,
      new File([testFileContent], "action.js", {
        type: "application/javascript",
      }),
    );

    const newFileContent = `
      export default {
        uuid: "test-action-uuid",
        title: "New Action Title",
        description: "New Description",
        builtIn: false,
        runOnCreates: true,
        runOnUpdates: false,
        runManually: true,
        params: [],
        filters: [],
        groupsAllowed: ["--root--"]
      }
    `;
    const actionOrErr = await service.createOrReplace(
      adminAuthContext,
      new File([newFileContent], "action.js", {
        type: "application/javascript",
      }),
    );

    expect(actionOrErr.isRight(), errToMsg(actionOrErr.value)).toBeTruthy();
    expect(actionOrErr.right.uuid).toBe("test-action-uuid");
    expect(actionOrErr.right.title).toBe("New Action Title");
    expect(actionOrErr.right.description).toBe("New Description");
  });

  test("get should return action", async () => {
    const service = await createService();
    await service.createOrReplace(
      adminAuthContext,
      new File([testFileContent], "action.js", {
        type: "application/javascript",
      }),
    );

    const actionOrErr = await service.get(adminAuthContext, "test-action-uuid");

    expect(actionOrErr.isRight(), errToMsg(actionOrErr.value)).toBeTruthy();
    expect(actionOrErr.right.uuid).toBe("test-action-uuid");
    expect(actionOrErr.right.title).toBe("Test Action");
    expect(actionOrErr.right.description).toBe("This is a test action.");
  });

  test("get should return built-in action 'copy_to_folder' ", async () => {
    const service = await createService();

    const actionOrErr = await service.get(adminAuthContext, "copy_to_folder");

    expect(actionOrErr.isRight(), errToMsg(actionOrErr.value)).toBeTruthy();
    expect(actionOrErr.right.uuid).toBe("copy_to_folder");
    expect(actionOrErr.right.title).toBe("Copiar para pasta");
  });

  test("get should return error if action does not exist", async () => {
    const service = await createService();

    const actionOrErr = await service.get(
      adminAuthContext,
      "non-existing-action-uuid",
    );

    expect(actionOrErr.isLeft()).toBeTruthy();
    expect(actionOrErr.value).toBeInstanceOf(NodeNotFoundError);
  });

  test("delete should remove action", async () => {
    const service = await createService();
    await service.createOrReplace(
      adminAuthContext,
      new File([testFileContent], "action.js", {
        type: "application/javascript",
      }),
    );

    const deleteResult = await service.delete(
      adminAuthContext,
      "test-action-uuid",
    );

    expect(deleteResult.isRight(), errToMsg(deleteResult.value)).toBeTruthy();
  });

  test("list should return all actions including built-ins", async () => {
    const service = await createService();
    await service.createOrReplace(
      adminAuthContext,
      new File([testFileContent], "action.js", {
        type: "application/javascript",
      }),
    );

    const actions = await service.list(adminAuthContext);

    expect(actions.right.length).toBe(5);
  });

  test("export should create a 'Javascript' file containing action", async () => {
    const service = await createService();
    await service.createOrReplace(
      adminAuthContext,
      new File([testFileContent], "action.js", {
        type: "application/javascript",
      }),
    );

    const fileOrErr = await service.export(
      adminAuthContext,
      "test-action-uuid",
    );

    expect(fileOrErr.isRight(), errToMsg(fileOrErr.value)).toBeTruthy();
    expect(fileOrErr.right.name).toBe("Test Action.js");
    expect(fileOrErr.right.type.startsWith("application/javascript"))
      .toBeTruthy();
  });

  test("run should run the action", async () => {
    const service = await createService();
    await service.createOrReplace(
      adminAuthContext,
      new File([testFileContent], "action.js", {
        type: "application/javascript",
      }),
    );

    const runResult = await service.run(adminAuthContext, "test-action-uuid", [
      "node-uuid-1",
      "node-uuid-2",
    ]);

    expect(runResult.isRight(), errToMsg(runResult.value)).toBeTruthy();
    expect(runResult.value).toBeUndefined();
  });

  test("run should run action as root user", async () => {
    const service = await createService();
    const fileContent = `
      export default {
        uuid: "test-action-uuid",
        title: "Test Action",
        description: "Description",
        builtIn: false,
        runOnCreates: true,
        runOnUpdates: false,
        runManually: true,
        runAs: "root@antbox.io",
        params: [],
        filters: [],
        groupsAllowed: [],

        run: async (ctx, uuids, params) => {
          console.log("Running action", ctx.authenticationContext);
        }
      };
    `;
    await service.createOrReplace(
      adminAuthContext,
      new File([fileContent], "action.js", { type: "application/javascript" }),
    );

    const runResult = await service.run(adminAuthContext, "test-action-uuid", [
      "node-uuid-1",
      "node-uuid-2",
    ]);

    expect(runResult.isRight(), errToMsg(runResult.value)).toBeTruthy();
    expect(runResult.value).toBeUndefined();
  });

  test("run should run action to delete more than one node", async () => {
    const service = await createService();
    const fileContent = `
      export default {
        uuid: "delete-action-uuid",
        title: "Test Action",
        description: "This is a test action.",
        builtIn: false,
        runOnCreates: true,
        runOnUpdates: false,
        runManually: true,
        params: [],
        filters: [],
        groupsAllowed: ["admins"],

        run: async (ctx, uuids, params) => {
          const tasks = uuids.map((uuid) => ctx.nodeService.delete(ctx.authenticationContext, uuid));

          const results = await Promise.all(tasks);

          const errors = results.filter((voidOrErr) => voidOrErr.isLeft());

          if (errors.length > 0) {
            errors.forEach((e) => console.error((e.value).message));
            return errors[0].value;
          }

          return;
        }
      };
    `;
    await service.createOrReplace(
      adminAuthContext,
      new File([fileContent], "delete.js", { type: "application/javascript" }),
    );

    const runResult = await service.run(
      adminAuthContext,
      "delete-action-uuid",
      ["--group-1--", "--group-2--"],
    );

    expect(runResult.isRight(), errToMsg(runResult.value)).toBeTruthy();
    expect(runResult.value).toBeUndefined();
  });

  test("run should return error if 'runMannally' is false and interaction mode is 'Direct'", async () => {
    const service = await createService();
    const adminAuthContext: AuthenticationContext = {
      mode: "Direct",
      tenant: "default",
      principal: {
        email: "admin@example.com",
        groups: [Groups.ADMINS_GROUP_UUID],
      },
    };
    const fileContent = `
      export default {
        uuid: "test-action-uuid",
        title: "Title",
        description: "Description",
        builtIn: false,
        runOnCreates: true,
        runOnUpdates: false,
        runManually: false,
        params: [],
        filters: [],
        groupsAllowed: ["admins"],

        run: async (ctx, uuids, params) => {
          console.log("Running action", ctx, uuids, params);
        }
      };
    `;
    await service.createOrReplace(
      adminAuthContext,
      new File([fileContent], "action.js", { type: "application/javascript" }),
    );

    const runResult = await service.run(adminAuthContext, "test-action-uuid", [
      "--group-1--",
      "--group-2--",
    ]);

    expect(runResult.isLeft()).toBeTruthy();
    expect(runResult.value).toBeInstanceOf(BadRequestError);
    expect((runResult.value as BadRequestError).message).toBe(
      "Action cannot be run manually",
    );
  });

  test("run should return error if action is not found", async () => {
    const service = await createService();

    const runResult = await service.run(
      adminAuthContext,
      "non-existing-action-uuid",
      ["node-uuid-1", "node-uuid-2"],
    );

    expect(runResult.isLeft()).toBeTruthy();
    expect(runResult.value).toBeInstanceOf(NodeNotFoundError);
  });

  test("runAutomaticActionsForCreates should run action automacally for creates", async () => {
    const service = await createService();
    const fileContent = `
      export default {
        uuid: "test-action-uuid",
        title: "Test Action",
        description: "Description",
        builtIn: false,
        runOnCreates: true,
        runOnUpdates: false,
        runManually: false,
        params: [],
        filters: [],
        groupsAllowed: [],

        run: async (ctx, uuids, params) => {
          const tasks = uuids.map((uuid) => ctx.nodeService.delete(ctx.authenticationContext, uuid));

          const results = await Promise.all(tasks);

          const errors = results.filter((voidOrErr) => voidOrErr.isLeft());

          if (errors.length > 0) {
            errors.forEach((e) => console.error((e.value).message));
            return errors[0].value;
          }

          return;
        }
      };
    `;
    const actionOrErr = await service.createOrReplace(
      adminAuthContext,
      new File([fileContent], "action.js", { type: "application/javascript" }),
    );

    const nodeCreatedEvent = new NodeCreatedEvent(
      adminAuthContext.principal.email,
      "default",
      {
        uuid: actionOrErr.right.uuid,
        title: actionOrErr.right.title,
        description: actionOrErr.right.description,
        owner: adminAuthContext.principal.email,
        parent: actionOrErr.right.parent,
      } as ActionNode,
    );

    const runResult = await service.runAutomaticActionsForCreates(
      nodeCreatedEvent,
    );

    expect(runResult).toBeUndefined();
  });

  test("runAutomaticActionsForUpdates should run action automacally for updates", async () => {
    const service = await createService();
    const fileContent = `
      export default {
        uuid: "copy-folder-uuid",
        title: "Test Action",
        description: "Description",
        builtIn: false,
        runOnCreates: false,
        runOnUpdates: true,
        runManually: false,
        params: ["to"],
        filters: [],
        groupsAllowed: [],

        run: async (ctx, uuids, params) => {
          const parent = params;

          if (!parent) {
            return Promise.reject(new Error("Error parameter not given"));
          }

          const batchCopy = uuids.map((u) => ctx.nodeService.copy(ctx.authenticationContext, u, parent));
          const results = await Promise.all(batchCopy);

          const errors = results.filter((r) => r.isLeft());

          if (errors.length > 0) {
            return errors[0].value;
          }

          return;
        }
      };
    `;
    const actionOrErr = await service.createOrReplace(
      adminAuthContext,
      new File([fileContent], "action.js", { type: "application/javascript" }),
    );

    const nodeUpdatedEvent = new NodeUpdatedEvent(
      adminAuthContext.principal.email,
      "default",
      {
        uuid: actionOrErr.right.uuid,
        title: actionOrErr.right.title,
        description: actionOrErr.right.description,
        owner: adminAuthContext.principal.email,
        parent: actionOrErr.right.parent,
      } as ActionNode,
    );

    const runResult = await service.runAutomaticActionsForUpdates(
      adminAuthContext,
      nodeUpdatedEvent,
    );

    expect(runResult).toBeUndefined();
  });

  test("runOnCreateScripts should run action on create scripts", async () => {
    const service = await createService();
    const fileContent = `
      export default {
        uuid: "test-action-uuid",
        title: "Test Action",
        description: "Description",
        builtIn: false,
        runOnCreates: true,
        runOnUpdates: false,
        runManually: true,
        params: [],
        filters: [],
        groupsAllowed: [],

        run: async (ctx, uuids, params) => {
          console.log("Running action", ctx.authenticationContext);
        }
      };
    `;
    const actionOrErr = await service.createOrReplace(
      adminAuthContext,
      new File([fileContent], "action.js", { type: "application/javascript" }),
    );

    const nodeCreatedEvent = new NodeCreatedEvent(
      adminAuthContext.principal.email,
      "default",
      {
        uuid: actionOrErr.right.uuid,
        title: actionOrErr.right.title,
        description: actionOrErr.right.description,
        owner: adminAuthContext.principal.email,
        parent: actionOrErr.right.parent,
      } as ActionNode,
    );

    const runResult = await service.runOnCreateScritps(
      adminAuthContext,
      nodeCreatedEvent,
    );

    expect(runResult).toBeUndefined();
  });

  test("runOnUpdatedScripts should run action on update scripts", async () => {
    const service = await createService();
    const fileContent = `
      export default {
        uuid: "test-action-uuid",
        title: "Test Action",
        description: "Description",
        builtIn: false,
        runOnCreates: false,
        runOnUpdates: true,
        runManually: true,
        params: [],
        filters: [],
        groupsAllowed: [],

        run: async (ctx, uuids, params) => {
          console.log("Running action", ctx.authenticationContext);
        }
      };
    `;
    const actionOrErr = await service.createOrReplace(
      adminAuthContext,
      new File([fileContent], "action.js", { type: "application/javascript" }),
    );

    const nodeUpdatedEvent = new NodeUpdatedEvent(
      adminAuthContext.principal.email,
      "default",
      {
        uuid: actionOrErr.right.uuid,
        title: actionOrErr.right.title,
        description: actionOrErr.right.description,
        owner: adminAuthContext.principal.email,
        parent: actionOrErr.right.parent,
      } as ActionNode,
    );

    const runResult = await service.runOnUpdatedScritps(
      adminAuthContext,
      nodeUpdatedEvent,
    );

    expect(runResult).toBeUndefined();
  });
});

const errToMsg = (err: any) => {
  if (err instanceof Error) {
    return err.message;
  }

  return JSON.stringify(err, null, 3);
};
