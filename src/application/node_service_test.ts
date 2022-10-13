import { InMemoryStorageProvider } from "./../adapters/inmem/inmem_storage_provider.ts";
import { InMemoryNodeRepository } from "../adapters/inmem/inmem_node_repository.ts";
import { UserPrincipal } from "../domain/auth/user_principal.ts";
import { NodeServiceContext } from "./node_service.ts";
import { NodeService } from "./node_service.ts";
import { assertStrictEquals, fail } from "../../dev_deps.ts";
import { FolderNotFoundError } from "../domain/nodes/folder_not_found_error.ts";

Deno.test("createFile", async (t) => {
  await t.step(
    "Devolve FolderNotFoundError se o parent não existir no repositório",
    async () => {
      const svc = new NodeService(makeServiceContext());

      const file = new File([""], "test.txt", { type: "text/plain" });

      const result = await svc.createFile(
        makeUserPrincipal(),
        file,
        "bad_parent_uuid"
      );

      if (result.isRight()) {
        fail("Deveria ter devolvido um erro");
      }

      assertStrictEquals(
        result.value.errorCode,
        FolderNotFoundError.ERROR_CODE
      );
    }
  );
});

function makeServiceContext(): NodeServiceContext {
  return {
    repository: new InMemoryNodeRepository(),
    storage: new InMemoryStorageProvider(),
  };
}

function makeUserPrincipal(): UserPrincipal {
  return {
    username: "user1",
    roles: [],
    groups: [],
  };
}
