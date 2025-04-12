import { Command } from "commander";
import { printServerKeys } from "./print_server_keys.ts";
import { PORT } from "setup/server_defaults.ts";
import { setupTenants } from "setup/setup_tenants.ts";
import { setupOakServer } from "adapters/oak/setup_oak_server.ts";

interface ComandOpts {
  port?: string;
  passwd?: string;
  keys?: boolean;
}

async function startSandboxServer(opts: ComandOpts) {
  const port = opts.port ? parseInt(opts.port) : PORT;

  const tenants = await setupTenants({
    ocrEngine: ["tesseract/tesseract_ocr_engine.ts"],
    tenants: [
      {
        name: "sandbox",
        rootPasswd: opts.passwd,
      },
    ],
  });

  const startServer = setupOakServer(tenants);

  startServer({ port }).then((evt: unknown) => {
    console.log(
      "Antbox Sandbox Server started successfully on port ::",
      (evt as Record<string, string>).port,
    );
  });
}

if (import.meta.main) {
  new Command()
    .name("sandbox")
    .description("Prova de conceito em memória")
    .option("--port <port>", "porta do servidor [7180]")
    .option("--passwd <passwd>", "senha do root [demo]")
    .option("--keys", "imprime as chaves de criptografia")
    .action((opts) => {
      if (opts.keys) {
        printServerKeys({ passwd: opts.passwd });
        process.exit(0);
      }

      startSandboxServer(opts);
    })
    .parse(process.argv);
}
