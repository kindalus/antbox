import { DefaultFidGenerator } from "/strategies/default_fid_generator.ts";

import { VERSION } from "./version.ts";

import { join } from "/deps/path";
import { Command, IParseResult } from "/deps/command";

import { FlatFileStorageProvider } from "/adapters/flat_file/flat_file_storage_provider.ts";

import { DefaultUuidGenerator } from "/strategies/default_uuid_generator.ts";
import { PouchdbNodeRepository } from "./src/adapters/pouchdb/pouchdb_node_repository.ts";
import { setupOakServer } from "./src/adapters/oak/setup_oak_server.ts";
import { AntboxService } from "./src/application/antbox_service.ts";
import { NodeServiceContext } from "./src/application/node_service_context.ts";

const SYMMETRIC_KEY = "ui2tPcQZvN+IxXsEW6KQOOFROS6zXB1pZdotBR3Ot8o=";
const ROOT_PASSWD = "antboxroot";

const program = await new Command()
  .name("antbox-sand")
  .version(VERSION)
  .description("Prova de conceito")
  .arguments("[dir]")
  .option("--port <port>", "porta do servidor [7180]")
  .parse(Deno.args);

function makeNodeServiceContext(baseDir: string): NodeServiceContext {
  const storage = new FlatFileStorageProvider(baseDir);

  const nodeRepository = new PouchdbNodeRepository(join(baseDir, "repo"));

  return {
    uuidGenerator: new DefaultUuidGenerator(),
    fidGenerator: new DefaultFidGenerator(),
    repository: nodeRepository,
    storage,
  };
}

function main(program: IParseResult) {
  const baseDir = program.args?.[0];
  const port = program.options.port || "7180";

  if (!baseDir) {
    console.error("No base folder specified");
    Deno.exit(-1);
  }

  const nodeCtx = makeNodeServiceContext(baseDir);
  const service = new AntboxService(nodeCtx);

  const startServer = setupOakServer(service, SYMMETRIC_KEY, ROOT_PASSWD);

  startServer({ port: parseInt(port) }).then(() => {
    console.log("Antbox Server started successfully on port ::" + port);
  });
}

main(program);
