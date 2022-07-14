import { Command, IParseResult } from "https://deno.land/x/cliffy@v0.19.2/command/mod.ts";
import { VERSION } from "./version.ts";

import { join } from "/deps/path";

import FlatFileAspectRepository from "./src/infra/persistence/flat_file_aspect_repository.ts";
import FlatFileNodeRepository from "./src/infra/persistence/flat_file_node_repository.ts";
import FlatFileStorageProvider from "./src/infra/storage/flat_file_storage_provider.ts";

import { startServer } from "./server.ts";
import { EcmConfig } from "/application/ecm_registry.ts";

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

function buildEcmConfig(portalDataFolder: string): EcmConfig {
	const storage = new FlatFileStorageProvider(
		join(portalDataFolder, "nodes"),
	);
	const nodeRepository = new FlatFileNodeRepository(
		join(portalDataFolder, "repo"),
	);
	const aspectRepository = new FlatFileAspectRepository(
		join(portalDataFolder, "aspects"),
	);

	return {
		nodeServiceContext: {
			repository: nodeRepository,
			storage,
		},

		aspectServiceContext: { repository: aspectRepository },
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
		console.log("Antbox Server started successfully on port ::" + port);
	});
}

main(program);
