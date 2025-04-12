import { Command } from "commander";
import { join } from "path";
import { printServerKeys } from "./print_server_keys.ts";
import { setupOakServer } from "adapters/oak/setup_oak_server.ts";
import { PORT } from "./setup/server_defaults.ts";
import { setupTenants } from "./setup/setup_tenants.ts";

interface CommandOpts {
  port?: string;
  passwd?: string;
  keys?: boolean;
}

async function startDemoServer(baseDir: string, opts: CommandOpts) {
  const port = opts.port ? parseInt(opts.port) : PORT;
  const tenants = await setupTenants({
    ocrEngine: ["tesseract/tesseract_ocr_engine.ts"],
    tenants: [
      {
        name: "demo",
        rootPasswd: opts.passwd,
        storage: [
          "flat_file/flat_file_storage_provider.ts",
          join(baseDir, "storage"),
        ],
        repository: [
          "pouchdb/pouchdb_node_repository.ts",
          join(baseDir, "repository"),
        ],
      },
    ],
  });

  const startServer = setupOakServer(tenants);

  startServer({ port }).then((evt: unknown) => {
    console.log(
      "Antbox Demo Server started successfully on port ::",
      (evt as Record<string, string>).port,
    );
  });
}

if (import.meta.main) {
  new Command()
    .name("demo")
    //.version(VERSION)
    .description("Prova de conceito")
    .arguments("[dir]")
    .option("--port <port>", "porta do servidor [7180]")
    .option("--passwd <passwd>", "senha do root [demo]")
    .option("--keys", "imprime as chaves de criptografia")
    .action((baseDir, opts) => {
      if (opts.keys) {
        printServerKeys({ passwd: opts.passwd });
        process.exit(0);
      }

      if (!baseDir) {
        console.error("No base folder specified");
        process.exit(-1);
      }

      startDemoServer(baseDir, opts);
    })
    .parse(process.argv);
}
