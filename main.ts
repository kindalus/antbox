import { Command } from "commander";
import { exists } from "https://deno.land/std@0.208.0/fs/mod.ts";
import { parse } from "https://deno.land/std@0.208.0/toml/mod.ts";
import { printServerKeys } from "./src/print_server_keys.ts";
import { setupTenants } from "./src/setup/setup_tenants.ts";
import { setupOakServer } from "./src/adapters/oak/setup_oak_server.ts";
import { setupH3Server } from "./src/adapters/h3/setup_h3_server.ts";
import { PORT } from "./src/setup/server_defaults.ts";
import type { ServerConfiguration } from "./src/api/http_server_configuration.ts";
import process from "node:process";

interface CommandOpts {
  config?: string;
  keys?: boolean;
  demo?: boolean;
  sandbox?: boolean;
}

interface TomlConfiguration {
  engine: string;
  port?: number;
  tenants: Array<{
    name: string;
    rootPasswd?: string;
    key?: string;
    jwk?: string;
    storage?: [string, ...string[]];
    repository?: [string, ...string[]];
  }>;
}

async function loadConfiguration(
  configPath: string,
): Promise<ServerConfiguration> {
  if (!(await exists(configPath))) {
    console.error(`Configuration file not found: ${configPath}`);
    Deno.exit(1);
  }

  const configText = await Deno.readTextFile(configPath);
  const tomlConfig = parse(configText) as TomlConfiguration;

  return {
    port: tomlConfig.port || PORT,
    engine: tomlConfig.engine,
    tenants: tomlConfig.tenants.map((tenant) => ({
      name: tenant.name,
      rootPasswd: tenant.rootPasswd,
      symmetricKey: tenant.key,
      jwkPath: tenant.jwk,
      storage: tenant.storage,
      repository: tenant.repository,
    })),
  };
}

async function startServer(config: ServerConfiguration) {
  const tenants = await setupTenants({
    tenants: config.tenants,
  });

  let startServerFn;

  if (config.engine === "oak") {
    startServerFn = setupOakServer(tenants);
  } else if (config.engine === "h3") {
    startServerFn = setupH3Server(tenants);
  } else {
    console.error(`Unknown engine: ${config.engine}`);
    Deno.exit(1);
  }

  const port = config.port || PORT;

  startServerFn({ port }).then((evt: unknown) => {
    console.log(
      `Antbox Server (${config.engine}) started successfully on port ::`,
      (evt as Record<string, string>).port,
    );
  });
}

if (import.meta.main) {
  new Command()
    .name("antbox")
    .description("Antbox ECM Server")
    .option(
      "-f, --config <file>",
      "configuration file path",
      "./.config/antbox.toml",
    )
    .option("--keys", "print crypto keys and exit")
    .option("--demo", "run with demo configuration")
    .option("--sandbox", "run with sandbox configuration")
    .action(async (opts: CommandOpts) => {
      if (opts.keys) {
        printServerKeys({});
        Deno.exit(0);
      }

      let configPath = opts.config || "./.config/antbox.toml";

      if (opts.demo) {
        configPath = "./.config/demo.toml";
      } else if (opts.sandbox) {
        configPath = "./.config/sandbox.toml";
      }

      const config = await loadConfiguration(configPath);
      await startServer(config);
    })
    .parse(process.argv);
}
