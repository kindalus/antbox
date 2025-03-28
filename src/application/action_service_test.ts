import { beforeAll, describe, expect, jest, test } from "bun:test";
import { ActionService } from "./action_service";
import { NodeService } from "./node_service";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository";
import { InMemoryEventBus } from "adapters/inmem/inmem_event_bus";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider";
import { UsersGroupsService } from "./users_groups_service";
import type { AuthenticationContext } from "./authentication_context";
import { Groups } from "domain/users_groups/groups";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error";

const createService = () => {
  const repository = new InMemoryNodeRepository();
  const storage = new InMemoryStorageProvider();
  const eventBus = new InMemoryEventBus();

  const nodeService = new NodeService({ repository, storage, bus: eventBus });
  const usersGroupsService = new UsersGroupsService({ repository, storage, bus: eventBus });

  return new ActionService(nodeService, usersGroupsService);
}

const adminAuthContext: AuthenticationContext = {
  mode: "Action",
  tenant: "default",
  principal: {
    email: "admin@example.com",
    groups: [Groups.ADMINS_GROUP_UUID]
  },
}

const testFileContent = `
  export default {
    uuid: "test-action-uuid",
    title: "Test Action",
    description: "This is a test action.",
    builtIn: false,
    runOnCreates: true,
    runOnUpdates: false,
    runManually: false,
    params: [],
    filters: [],
    groupsAllowed: ["admins"]
  };
`;

describe("ActionService", () => {
  test("createOrReplace should create a new action", async () => {
    const service = createService();
    const file = new File([testFileContent], "action.js",{ type: "application/javascript" });

    const actionOrErr = await service.createOrReplace(adminAuthContext, file);

    expect(actionOrErr.isRight(), errToMsg(actionOrErr.value)).toBeTruthy();
    expect(actionOrErr.right.uuid).toBe("test-action-uuid");
    expect(actionOrErr.right.title).toBe("Test Action");
    expect(actionOrErr.right.description).toBe("This is a test action.");
  });

  test("createOrReplace should replace existing action", async () => { 
    const service = createService();

    await service.createOrReplace(adminAuthContext, new File([testFileContent], "action.js",{ type: "application/javascript" }));
    
    const newFileContent = `
      export default {
        uuid: "test-action-uuid",
        title: "New Action Title",
        description: "New Description",
        builtIn: false,
        runOnCreates: false,
        runOnUpdates: true,
        runManually: false,
        params: [],
        filters: [],
        groupsAllowed: ["--root--"]
      }
    `;

    const actionOrErr = await service.createOrReplace(adminAuthContext, new File([newFileContent], "action.js",{ type: "application/javascript" }));  

    expect(actionOrErr.isRight(), errToMsg(actionOrErr.value)).toBeTruthy();
    expect(actionOrErr.right.uuid).toBe("test-action-uuid");
    expect(actionOrErr.right.title).toBe("New Action Title");
    expect(actionOrErr.right.description).toBe("New Description");
    expect(actionOrErr.right.groupsAllowed).toEqual(["--root--"]);
  });

  test("get should return action", async () => {
    const service = createService();

    await service.createOrReplace(adminAuthContext, new File([testFileContent], "action.js",{ type: "application/javascript" }));

    const actionOrErr = await service.get(adminAuthContext, "test-action-uuid");

    expect(actionOrErr.isRight(), errToMsg(actionOrErr.value)).toBeTruthy();
    expect(actionOrErr.right.uuid).toBe("test-action-uuid");
    expect(actionOrErr.right.title).toBe("Test Action");
    expect(actionOrErr.right.description).toBe("This is a test action.");
  });

  test("get should return built-in action 'copy_to_folder' ", async () => {
    const service = createService();

    const actionOrErr = await service.get(adminAuthContext, "copy_to_folder");

    expect(actionOrErr.isRight(), errToMsg(actionOrErr.value)).toBeTruthy();
    expect(actionOrErr.right.uuid).toBe("copy_to_folder");
    expect(actionOrErr.right.title).toBe("Copiar para pasta");
    expect(actionOrErr.right.builtIn).toBeTruthy();
  });

  test("get should return error if action does not exist", async () => {
    const service = createService();

    const actionOrErr = await service.get(adminAuthContext, "non-existing-action-uuid");

    expect(actionOrErr.isLeft()).toBeTruthy();
    expect(actionOrErr.value).toBeInstanceOf(NodeNotFoundError);
  });

  test("delete should remove action", async () => {
    const service = createService();

    await service.createOrReplace(adminAuthContext, new File([testFileContent], "action.js",{ type: "application/javascript" }));

    const deleteResult = await service.delete(adminAuthContext, "test-action-uuid");

    expect(deleteResult.isRight(), errToMsg(deleteResult.value)).toBeTruthy();
  });

  test("list should return all actions including built-ins", async () => {
    const service = createService();
    await service.createOrReplace(adminAuthContext, new File([testFileContent], "action.js",{ type: "application/javascript" }));

    const actions = await service.list(adminAuthContext);

    expect(actions.length).toBe(5);
  });

  test("export should create a 'Javascript' file containing action", async () => {
    const service = createService();

    await service.createOrReplace(adminAuthContext, new File([testFileContent], "action.js",{ type: "application/javascript" }));

    const fileOrErr = await service.export(adminAuthContext, "test-action-uuid");

    expect(fileOrErr.isRight(), errToMsg(fileOrErr.value)).toBeTruthy();
    expect(fileOrErr.right.name).toBe("Test Action");
    expect(fileOrErr.right.type.startsWith("text/javascript")).toBeTruthy();
  });
}); 

const errToMsg = (err: any) => {
  if (err instanceof Error) {
    return err.message;
  }

  return JSON.stringify(err, null, 3);
}


