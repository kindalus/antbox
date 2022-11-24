import { DefaultFidGenerator } from "/strategies/default_fid_generator.ts";
import { InMemoryUserRepository } from "/adapters/inmem/inmem_user_repository.ts";
import { InMemoryGroupRepository } from "/adapters/inmem/inmem_group_repository.ts";

import { VERSION } from "./version.ts";

import { join } from "/deps/path";
import { Command, IParseResult } from "/deps/command";

import { FlatFileStorageProvider } from "/adapters/flat_file/flat_file_storage_provider.ts";

import { startServer } from "/adapters/opine/server.ts";
import { EcmConfig } from "/application/ecm_registry.ts";
import { DefaultPasswordGenerator } from "/strategies/default_password_generator.ts";
import { DefaultUuidGenerator } from "/strategies/default_uuid_generator.ts";
import { PouchdbNodeRepository } from "./src/adapters/pouchdb/pouchdb_node_repository.ts";

const program = await new Command()
  .name("antbox-sand")
  .version(VERSION)
  .description("Prova de conceito")
  .arguments("[dir]")
  .option("--port <port>", "porta do servidor [7180]")
  .parse(Deno.args);

function buildEcmConfig(portalDataFolder: string): EcmConfig {
  return {
    ...makeNodeServiceContext(portalDataFolder),
    ...makeAuthServiceContext(),
  };
}

function makeAuthServiceContext() {
  return {
    emailSender: {
      send: () => undefined,
    },

    uuidGenerator: new DefaultUuidGenerator(),
    passwordGenerator: new DefaultPasswordGenerator(),

    userRepository: new InMemoryUserRepository(),
    groupRepository: new InMemoryGroupRepository(),
  };
}

function makeNodeServiceContext(baseDir: string) {
  const storage = new FlatFileStorageProvider(baseDir);

  const nodeRepository = new PouchdbNodeRepository(join(baseDir, "repo"));

  return {
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

  const config = buildEcmConfig(baseDir);

  const server = startServer(config);

  server.listen({ port: parseInt(port) }, () => {
    console.log("Antbox Server started successfully on port ::" + port);
  });
}

main(program);
