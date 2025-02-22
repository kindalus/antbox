import type { ModuleConfiguration } from "api/http_server_configuration";
import type { AntboxError } from "shared/antbox_error";
import type { Either } from "shared/either";

export async function providerFrom<T>(
  cfg?: ModuleConfiguration,
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
    process.exit(-1);
  }

  return providerOrErr.value;
}

async function loadModule<T>(
  modulePath: string,
): Promise<(...p: string[]) => Promise<Either<AntboxError, T>>> {
  const path =
    modulePath.startsWith("/") || modulePath.startsWith("https://")
      ? modulePath
      : `adapters/${modulePath}`;

  try {
    const m = await import(path);
    return m.default;
  } catch (e) {
    console.error("could not load module");
    console.error(e);
    process.exit(-1);
  }
}
