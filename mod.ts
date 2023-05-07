import { setupOakServer } from "./src/adapters/oak/setup_oak_server.ts";
import { Either } from "./src/shared/either.ts";
import { AntboxError } from "./src/shared/antbox_error.ts";
import { InMemoryNodeRepository } from "./src/adapters/inmem/inmem_node_repository.ts";
import { InMemoryStorageProvider } from "./src/adapters/inmem/inmem_storage_provider.ts";
import { DefaultFidGenerator } from "./src/adapters/strategies/default_fid_generator.ts";
import { DefaultUuidGenerator } from "./src/adapters/strategies/default_uuid_generator.ts";
import { AntboxService } from "./src/application/antbox_service.ts";

import defaultJwk from "./demo.jwk.json" assert { type: "json" };

// export type { AntboxService, NodeRepository, StorageProvider };

const SYMMETRIC_KEY = "ui2tPcQZvN+IxXsEW6KQOOFROS6zXB1pZdotBR3Ot8o=";
const ROOT_PASSWD = "demo";
const PORT = 7180;

export type ModuleConfiguration = [modulePath: string, ...params: string[]];
export interface ServerOpts {
  port?: number;
  rootPasswd?: string;
  symmetricKey?: string;
  jwkPath?: string;
  storage?: ModuleConfiguration;
  repository?: ModuleConfiguration;
}

export async function startServer(opts?: ServerOpts) {
  const passwd = opts?.rootPasswd ?? ROOT_PASSWD;
  const port = opts?.port ?? PORT;
  const symmetricKey = opts?.symmetricKey ?? SYMMETRIC_KEY;

  const jwk = await loadJwk(opts?.jwkPath);

  const service = new AntboxService({
    uuidGenerator: new DefaultUuidGenerator(),
    fidGenerator: new DefaultFidGenerator(),
    repository:
      (await providerFrom(opts?.repository)) ?? new InMemoryNodeRepository(),
    storage:
      (await providerFrom(opts?.storage)) ?? new InMemoryStorageProvider(),
  });

  setupOakServer(service, passwd, jwk, symmetricKey)
    .then((start) => start({ port }))
    .then((evt: unknown) => {
      console.log(
        "Antbox Server started successfully on port ::",
        (evt as Record<string, string>).port
      );
    });
}

export async function printKeys(opts?: {
  passwd?: string;
  symmetricKey?: string;
  jwkPath?: string;
}) {
  console.log("Root passwd:\t", opts?.passwd ?? ROOT_PASSWD);

  console.log("Symmetric Key:\t", opts?.symmetricKey ?? SYMMETRIC_KEY);
  console.log(
    "JSON Web Key:\t",
    JSON.stringify(await loadJwk(opts?.jwkPath), null, 4)
  );
}

async function loadJwk(jwkPath?: string): Promise<Record<string, string>> {
  if (!jwkPath) {
    return defaultJwk;
  }

  const jwk = await Deno.readTextFile(jwkPath);
  return JSON.parse(jwk);
}

async function providerFrom<T>(
  cfg?: ModuleConfiguration
): Promise<T | undefined> {
  if (!cfg) {
    return;
  }

  const [modulePath, ...params] = cfg;
  const mod = await loadModule<T>(modulePath);

  const providerOrErr = await mod(...params);

  if (providerOrErr.isLeft()) {
    console.error("could not load provider");
    console.error(providerOrErr.value);
    Deno.exit(-1);
  }

  return providerOrErr.value;
}

function loadModule<T>(
  modulePath: string
): Promise<(...p: string[]) => Promise<Either<AntboxError, T>>> {
  const path = modulePath.startsWith("/")
    ? modulePath
    : `./src/adapters/${modulePath}`;

  return import(path)
    .then((m) => m.default)
    .catch((e) => {
      console.error("could not load module");
      console.error(e);
      Deno.exit(-1);
    });
}
