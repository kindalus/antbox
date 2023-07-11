import { VERSION } from "./version.ts";

import { printKeys, startServer } from "./mod.ts";
import { Command, IParseResult } from "./deps.ts";

const program = await new Command()
  .name("sandbox")
  .version(VERSION)
  .description("Prova de conceito em memória")
  .option("--port <port>", "porta do servidor [7180]")
  .option("--passwd <passwd>", "senha do root [demo]")
  .option("--keys", "imprime as chaves de criptografia")
  .parse(Deno.args);

function main(program: IParseResult) {
  if (program.options.keys) {
    printKeys({ passwd: program.options.passwd });
    Deno.exit(0);
  }

  startServer({
    port: program.options.port,
    tentants: [
      {
        name: "demo",
        rootPasswd: program.options.passwd,
      },
    ],
  });
}

main(program);
