import { setupOakServer } from "adapters/oak/setup_oak_server.ts";
import { PORT, ROOT_PASSWD } from "setup/server_defaults.ts";
import { setupTenants } from "setup/setup_tenants.ts";
import { NodeService } from "application/node_service.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { AuthenticationContext } from "application/authentication_context.ts";
import { Users } from "domain/users_groups/users.ts";
import { Groups } from "domain/users_groups/groups.ts";

async function startApiTestServer() {
  const tenants = await setupTenants({
    ocrEngine: ["tesseract/tesseract_ocr_engine.ts"],
    tenants: [
      {
        name: "test",
        rootPasswd: ROOT_PASSWD,
        storage: ["inmem/inmem_storage_provider.ts"],
        repository: ["inmem/inmem_node_repository.ts"],
      },
    ],
  });

  const service = tenants[0].nodeService;
  await populateRepository(service);

  const startServer = setupOakServer(tenants);

  startServer({ port: PORT }).then((evt: unknown) => {
    console.log(
      "Antbox API Test Server started successfully on port ::",
      (evt as Record<string, string>).port,
    );
  });
}

function buildRootContext(): AuthenticationContext {
  return {
    mode: "Direct",
    tenant: "default",
    principal: {
      email: Users.ROOT_USER_EMAIL,
      groups: [
        Groups.ADMINS_GROUP_UUID,
      ],
    },
  };
}

async function populateRepository(service: NodeService) {
  const ctx = buildRootContext();

  (await service.create(ctx, {
    uuid: "550e8400-e29b-41d4-a716-446655440010",
    title: "Documents",
    mimetype: Nodes.FOLDER_MIMETYPE,
  })).right;
}

if (import.meta.main) {
  startApiTestServer();
}
