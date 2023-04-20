import { assertFalse, assertStrictEquals } from "../../dev_deps.ts";
import { InMemoryNodeRepository } from "../adapters/inmem/inmem_node_repository.ts";
import { InMemoryStorageProvider } from "../adapters/inmem/inmem_storage_provider.ts";
import { FolderNotFoundError } from "../domain/nodes/folder_not_found_error.ts";
import { AntboxError } from "../shared/antbox_error.ts";
import { NodeService } from "./node_service.ts";
import { NodeServiceContext } from "./node_service_context.ts";

Deno.test("createFile", async (t) => {
  await t.step(
    "Devolve FolderNotFoundError se o parent não existir no repositório",
    async () => {
      const svc = new NodeService(makeServiceContext());

      const file = new File([""], "test.txt", { type: "text/plain" });

      const result = await svc.createFile(file, { parent: "bad_parent_uuid" });

      assertFalse(result.isRight());
      assertStrictEquals(
        (result.value as AntboxError).errorCode,
        FolderNotFoundError.ERROR_CODE
      );
    }
  );
});

function makeServiceContext(): NodeServiceContext {
  return {
    repository: new InMemoryNodeRepository(),
    storage: new InMemoryStorageProvider(),
    fidGenerator: { generate: () => "fid" },
    uuidGenerator: { generate: () => "uuid" },
  };
}
