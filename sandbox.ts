import { InMemoryUserRepository } from "/adapters/inmem/inmem_user_repository.ts";
import { InMemoryGroupRepository } from "/adapters/inmem/inmem_group_repository.ts";

import { VERSION } from "./version.ts";

import { Command, IParseResult } from "/deps/command";

import { InMemoryNodeRepository } from "/adapters/inmem/inmem_node_repository.ts";
import { InMemoryStorageProvider } from "/adapters/inmem/inmem_storage_provider.ts";

import { startServer } from "/adapters/opine/server.ts";
import { EcmConfig } from "/application/ecm_registry.ts";

import { DefaultPasswordGenerator } from "/strategies/default_password_generator.ts";
import { DefaultUuidGenerator } from "/strategies/default_uuid_generator.ts";
import { DefaultFidGenerator } from "/adapters/strategies/default_fid_generator.ts";

const program = await new Command()
  .name("antbox-sand")
  .version(VERSION)
  .description("Prova de conceito")
  .option("--port <port>", "porta do servidor [7180]")
  .parse(Deno.args);

function buildEcmConfig(): EcmConfig {
  return {
    emailSender: { send: () => undefined },
    uuidGenerator: new DefaultUuidGenerator(),
    fidGenerator: new DefaultFidGenerator(),
    passwordGenerator: new DefaultPasswordGenerator(),
    userRepository: new InMemoryUserRepository(),
    groupRepository: new InMemoryGroupRepository(),
    repository: new InMemoryNodeRepository(),
    storage: new InMemoryStorageProvider(),
  };
}

function main(program: IParseResult) {
  const port = program.options.port || "7180";

  const config = buildEcmConfig();

  const server = startServer(config);

  server.listen({ port: parseInt(port) }, () => {
    console.log("Antbox Server started successfully on port ::" + port);
  });
}

main(program);
