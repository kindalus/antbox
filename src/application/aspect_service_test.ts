import { describe, test } from "bdd";
import { expect } from "expect";
import { AspectService } from "./aspect_service.ts";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository.ts";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider.ts";
import { InMemoryEventBus } from "adapters/inmem/inmem_event_bus.ts";
import { NodeService } from "./node_service.ts";
import { Groups } from "domain/users_groups/groups.ts";
import type { AuthenticationContext } from "./authentication_context.ts";
import { AspectNotFoundError } from "domain/aspects/aspect_not_found_error.ts";
import type { AspectDTO } from "./aspect_dto.ts";

describe("AspectService", () => {
  const adminAuthContext: AuthenticationContext = {
    mode: "Direct",
    tenant: "default",
    principal: {
      email: "admin@example.com",
      groups: [Groups.ADMINS_GROUP_UUID],
    },
  };

  const testAspect: AspectDTO = {
    uuid: "test-aspect",
    title: "Test Aspect",
    description: "A test aspect",
    filters: [["mimetype", "==", "application/pdf"]],
    properties: [
      {
        name: "testProperty",
        title: "Test Property",
        type: "string",
        required: true,
      },
    ],
  };

  function createService() {
    const repository = new InMemoryNodeRepository();
    const storage = new InMemoryStorageProvider();
    const eventBus = new InMemoryEventBus();
    const nodeService = new NodeService({ repository, storage, bus: eventBus });
    return new AspectService(nodeService);
  }

  test("createOrReplace should create a new aspect", async () => {
    const service = createService();

    const aspectOrErr = await service.createOrReplace(
      adminAuthContext,
      testAspect,
    );

    expect(aspectOrErr.isRight(), errMsg(aspectOrErr.value)).toBeTruthy();
    expect(aspectOrErr.right.uuid).toBe(testAspect.uuid);
    expect(aspectOrErr.right.title).toBe(testAspect.title);
    expect(aspectOrErr.right.filters).toEqual(testAspect.filters);
  });

  test("createOrReplace should replace existing aspect", async () => {
    const service = createService();

    // Create initial aspect
    await service.createOrReplace(adminAuthContext, testAspect);

    // Update the aspect
    const updatedAspect = {
      ...testAspect,
      description: "Updated description",
      filters: [["mimetype", "==", "application/json"]],
    } satisfies AspectDTO;

    const aspectOrErr = await service.createOrReplace(
      adminAuthContext,
      updatedAspect,
    );

    expect(aspectOrErr.isRight(), errMsg(aspectOrErr.value)).toBeTruthy();
    expect(aspectOrErr.right.description).toBe(updatedAspect.description);
    expect(aspectOrErr.right.filters).toEqual(updatedAspect.filters);
  });

  test("get should return an aspect", async () => {
    const service = createService();

    await service.createOrReplace(adminAuthContext, testAspect);

    const aspectOrErr = await service.get(adminAuthContext, testAspect.uuid);

    expect(aspectOrErr.isRight(), errMsg(aspectOrErr.value)).toBeTruthy();
    expect(aspectOrErr.right.uuid).toBe(testAspect.uuid);
    expect(aspectOrErr.right.title).toBe(testAspect.title);
  });

  test("get should return error if aspect not found", async () => {
    const service = createService();

    const aspectOrErr = await service.get(
      adminAuthContext,
      "non-existent-aspect",
    );

    expect(aspectOrErr.isLeft()).toBeTruthy();
    expect(aspectOrErr.value).toBeInstanceOf(AspectNotFoundError);
  });

  test("list should return all aspects including built-ins", async () => {
    const service = createService();

    await service.createOrReplace(adminAuthContext, testAspect);
    await service.createOrReplace(adminAuthContext, {
      ...testAspect,
      uuid: "another-aspect",
      title: "Another Aspect",
    });

    const aspects = await service.list(adminAuthContext);

    expect(aspects.length).toEqual(2);
    expect(aspects.some((a) => a.uuid === testAspect.uuid)).toBeTruthy();
    expect(aspects.some((a) => a.uuid === "another-aspect")).toBeTruthy();
  });

  test("delete should remove an aspect", async () => {
    const service = createService();

    await service.createOrReplace(adminAuthContext, testAspect);

    const deleteResult = await service.delete(
      adminAuthContext,
      testAspect.uuid,
    );
    expect(deleteResult.isRight(), errMsg(deleteResult.value)).toBeTruthy();

    const aspectOrErr = await service.get(adminAuthContext, testAspect.uuid);
    expect(aspectOrErr.isLeft()).toBeTruthy();
    expect(aspectOrErr.value).toBeInstanceOf(AspectNotFoundError);
  });

  test("export should create a JSON file for the aspect", async () => {
    const service = createService();

    await service.createOrReplace(adminAuthContext, testAspect);

    const fileOrErr = await service.export(adminAuthContext, testAspect.uuid);

    expect(fileOrErr.isRight(), errMsg(fileOrErr.value)).toBeTruthy();
    expect(fileOrErr.right.type).toBe("application/json");
    expect(fileOrErr.right.name).toBe(`${testAspect.uuid}.json`);

    const content = JSON.parse(await fileOrErr.right.text());
    expect(content.uuid).toBe(testAspect.uuid);
    expect(content.title).toBe(testAspect.title);
  });
});

function errMsg(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}
