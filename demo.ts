import { VERSION } from "./version.ts";

import { printKeys, startServer } from "./mod.ts";
import { Command, IParseResult, join } from "./deps.ts";

const program = await new Command()
  .name("demo")
  .version(VERSION)
  .description("Prova de conceito")
  .arguments("[dir]")
  .option("--port <port>", "porta do servidor [7180]")
  .option("--passwd <passwd>", "senha do root [demo]")
  .option("--keys", "imprime as chaves de criptografia")
  .parse(Deno.args);

function main(program: IParseResult) {
  const baseDir = program.args?.[0] as string;

  if (program.options.keys) {
    printKeys({ passwd: program.options.passwd });
    Deno.exit(0);
  }

  if (!baseDir) {
    console.error("No base folder specified");
    Deno.exit(-1);
  }

  startServer({
    port: program.options.port ? parseInt(program.options.port) : undefined,
    rootPasswd: program.options.passwd,
    storage: [
      "flat_file/flat_file_storage_provider.ts",
      join(baseDir, "storage"),
    ],
    repository: [
      "pouchdb/pouchdb_node_repository.ts",
      join(baseDir, "repository"),
    ],
  });
}

main(program);
