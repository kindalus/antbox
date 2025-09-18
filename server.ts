import { setupOakServer } from "adapters/oak/setup_oak_server.ts";
import { setupTenants } from "setup/setup_tenants.ts";
import { PORT } from "setup/server_defaults.ts";

interface TenantConfig {
  name: string;
  jwkPath?: string;
  rootPasswd?: string;
  storage: [string, string];
  repository: [string, string];
}

interface ServerConfig {
  tenants: TenantConfig[];
  port?: number;
  ocrEngine?: [string];
}

export default async function startServer(config: ServerConfig) {
  const port = config.port || PORT;

  const tenants = await setupTenants({
    ocrEngine: config.ocrEngine || ["tesseract/tesseract_ocr_engine.ts"],
    tenants: config.tenants.map((tenant) => ({
      name: tenant.name,
      rootPasswd: tenant.rootPasswd,
      storage: tenant.storage,
      repository: tenant.repository,
    })),
  });

  const setupServer = setupOakServer(tenants);

  return setupServer({ port }).then((evt: unknown) => {
    console.log(
      "Antbox Server started successfully on port ::",
      (evt as Record<string, string>).port,
    );
    return evt;
  });
}
