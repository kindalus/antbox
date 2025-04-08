import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository.ts";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider.ts";
import type { AntboxTenant } from "api/antbox_tenant.ts";
import type { ServerConfiguration, TenantConfiguration } from "api/http_server_configuration.ts";
import { NodeService } from "application/node_service.ts";
import type { StorageProvider } from "application/storage_provider.ts";
import type { NodeRepository } from "domain/nodes/node_repository.ts";
import { JWK, ROOT_PASSWD, SYMMETRIC_KEY } from "./server_defaults.ts";
import { providerFrom } from "adapters/parse_module_configuration.ts";
import { AspectService } from "application/aspect_service.ts";

export async function setupTenants(o: ServerConfiguration): Promise<AntboxTenant[]> {
  // const ocrEngine =
  //   (await providerFrom<OcrEngine>(o.ocrEngine)) ?? new TesseractOcrEngine();
  return Promise.all(o.tenants.map(setupTenant));
}

async function setupTenant(cfg: TenantConfiguration): Promise<AntboxTenant> {
  const passwd = cfg?.rootPasswd ?? ROOT_PASSWD;
  const symmetricKey = cfg?.symmetricKey ?? SYMMETRIC_KEY;

  const rawJwk = await loadJwk(cfg?.jwkPath);
  const repository = await providerFrom<NodeRepository>(cfg?.repository);
  const storage = await providerFrom<StorageProvider>(cfg?.storage);

  const nodeService = new NodeService({
    repository: repository ?? new InMemoryNodeRepository(),
    storage: storage ?? new InMemoryStorageProvider(),
  });

  const aspectService = new AspectService(nodeService);

  return {
    name: cfg.name,
    nodeService,
    aspectService,
    rootPasswd: passwd,
    symmetricKey,
    rawJwk,
  };
}

async function loadJwk(jwkPath?: string): Promise<Record<string, string>> {
  if (!jwkPath) {
    return JWK;
  }

  const file = Bun.file(jwkPath);
  if (!file.exists) {
    console.error("JWK file not found");
    process.exit(-1);
  }

  return file.json();
}
