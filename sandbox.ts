import InMemoryUserRepository from "/adapters/inmem/inmem_user_repository.ts";
import InMemoryGroupRepository from "/adapters/inmem/inmem_group_repository.ts";

import { VERSION } from "./version.ts";

import { join } from "/deps/path";
import { Command, IParseResult } from "/deps/command";

import FlatFileAspectRepository from "/adapters/flat_file/flat_file_aspect_repository.ts";
import FlatFileNodeRepository from "/adapters/flat_file/flat_file_node_repository.ts";
import FlatFileStorageProvider from "/adapters/flat_file/flat_file_storage_provider.ts";

import { startServer } from "./server.ts";
import { EcmConfig } from "/application/ecm_registry.ts";

import DefaultPasswordGenerator from "/strategies/default_password_generator.ts";
import DefaultUuidGenerator from "/strategies/default_uuid_generator.ts";
import FlatFileActionRepository from "/adapters/flat_file/flat_file_action_repository.ts";
import { NodeServiceContext } from "./src/application/node_service.ts";
import { AspectServiceContext } from "./src/application/aspect_service.ts";

const program = await new Command()
  .name("antbox-sand")
  .version(VERSION)
  .description("Prova de conceito")
  .arguments("[dir]")
  .option("--port <port>", "porta do servidor [7180]")
  .parse(Deno.args);

function buildEcmConfig(portalDataFolder: string): EcmConfig {
  return {
    nodeServiceContext: makeNodeServiceContext(portalDataFolder),
    aspectServiceContext: makeAspectServiceContext(portalDataFolder),
    authServiceContext: makeAuthServiceContext(),
    actionRepository: makeActionRepository(portalDataFolder),
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

function makeAspectServiceContext(baseDir: string): AspectServiceContext {
  const aspectRepository = new FlatFileAspectRepository(
    join(baseDir, "aspects")
  );

  return { repository: aspectRepository };
}

function makeNodeServiceContext(baseDir: string): NodeServiceContext {
  const storage = new FlatFileStorageProvider(join(baseDir, "nodes"));

  const nodeRepository = new FlatFileNodeRepository(join(baseDir, "repo"));

  return {
    repository: nodeRepository,
    storage,
  };
}

function makeActionRepository(baseDir: string): FlatFileActionRepository {
  return new FlatFileActionRepository(join(baseDir, "actions"));
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
    console.log("Antbox Server started successfully on port ::" + port);
  });
}

main(program);
