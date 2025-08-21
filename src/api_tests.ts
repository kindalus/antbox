import { setupOakServer } from "adapters/oak/setup_oak_server.ts";
import { PORT, ROOT_PASSWD } from "setup/server_defaults.ts";
import { setupTenants } from "setup/setup_tenants.ts";

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

  const startServer = setupOakServer(tenants);

  startServer({ port: PORT }).then((evt: unknown) => {
    console.log(
      "Antbox API Test Server started successfully on port ::",
      (evt as Record<string, string>).port,
    );
  });
}

if (import.meta.main) {
  startApiTestServer();
}
