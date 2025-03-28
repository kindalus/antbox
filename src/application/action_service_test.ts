import { beforeAll, describe, expect, jest, test } from "bun:test";
import { ActionService } from "./action_service";
import { NodeService } from "./node_service";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository";
import { InMemoryEventBus } from "adapters/inmem/inmem_event_bus";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider";
import { UsersGroupsService } from "./users_groups_service";
import type { AuthenticationContext } from "./authentication_context";
import { Groups } from "domain/users_groups/groups";

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
  test("should create an action", async () => {
    const service = createService();
    const file = new File([testFileContent], "action.js",{ type: "application/javascript" });

    const actionOrErr = await service.createOrReplace(adminAuthContext, file);

    expect(actionOrErr.isRight(), errToMsg(actionOrErr.value)).toBeTruthy();
    expect(actionOrErr.right.uuid).toBe("test-action-uuid");
    expect(actionOrErr.right.title).toBe("Test Action");
    expect(actionOrErr.right.description).toBe("This is a test action.");
  });

  test("should replace the action", async () => { 
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
  });
}); 

const errToMsg = (err: any) => {
  if (err instanceof Error) {
    return err.message;
  }

  return JSON.stringify(err, null, 3);
}


