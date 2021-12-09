import {
  Command,
  IParseResult,
} from "https://deno.land/x/cliffy@v0.19.2/command/mod.ts";
import { VERSION } from "./version.ts";

import { join } from "./deps.ts";

import FlatFileAspectRepository from "./src/repositories/flat_file_aspect_repository.ts";
import FlatFileNodeRepository from "./src/repositories/flat_file_node_repository.ts";

import FlatFileStorageProvider from "./src/storage/flat_file_storage_provider.ts";

import DefaultFidGenerator from "./src/strategies/default_fid_generator.ts";
import DefaultUuidGenerator from "./src/strategies/default_uuid_generator.ts";

import DefaultNodeService from "./src/ecm/default_node_service.ts";
import DefaultAspectService from "./src/ecm/default_aspect_service.ts";
import startServer from "./src/api/server.ts";

const program = await new Command()
  .name("antbox-sand")
  .version(VERSION)
  .description("Prova de conceito")
  .arguments("[dir]")
  .option(
    "--port <port>",
    "porta do servidor [7180]",
  )
  .parse(Deno.args);

function buildEcmConfig(portalDataFolder: string) {
  const fidGenerator = new DefaultFidGenerator();
  const uuidGenerator = new DefaultUuidGenerator();
  const storage = new FlatFileStorageProvider(
    join(portalDataFolder, "nodes"),
  );
  const nodeRepository = new FlatFileNodeRepository(
    join(portalDataFolder, "repo"),
  );
  const aspectRepository = new FlatFileAspectRepository(
    join(portalDataFolder, "aspects"),
  );
  const authService = { getUserId: () => "System" };

  return {
    nodeService: new DefaultNodeService({
      fidGenerator,
      uuidGenerator,
      repository: nodeRepository,
      storage,
      auth: authService,
    }),
    aspectService: new DefaultAspectService({
      repository: aspectRepository,
      auth: authService,
    }),
    authService,
  };
}

function main(program: IParseResult) {
  const baseDir = program.args?.[0];
  const port = program.options.port || "7180";

  if (!baseDir) {
    console.error("No base directory specified");
    Deno.exit(-1);
  }

  const config = buildEcmConfig(baseDir);

  const server = startServer(config);
  server.listen({ port: parseInt(port) }, () => {
    console.log("Antbox Server started successfully on port " + port);
  });
}

main(program);
