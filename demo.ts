import { DefaultFidGenerator } from "/strategies/default_fid_generator.ts";

import { VERSION } from "./version.ts";

import { join } from "/deps/path";
import { Command, IParseResult } from "/deps/command";

import {
	AntboxService,
	DefaultUuidGenerator,
	FlatFileStorageProvider,
	NodeServiceContext,
	PouchdbNodeRepository,
	ServerOpts,
	setupOakServer,
} from "./mod.ts";

const ROOT_PASSWD = "demo";

const program = await new Command()
	.name("demo")
	.version(VERSION)
	.description("Prova de conceito")
	.arguments("[dir]")
	.option("--port <port>", "porta do servidor [7180]")
	.option("--passwd <passwd>", "senha do root [demo]")
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
	const passwd = program.options.passwd || ROOT_PASSWD;

	if (!baseDir) {
		console.error("No base folder specified");
		Deno.exit(-1);
	}

	const nodeCtx = makeNodeServiceContext(baseDir);
	const service = new AntboxService(nodeCtx);

	const serverOpts: ServerOpts = {};
	if (program.options.port) {
		serverOpts.port = parseInt(program.options.port);
	}

	const startServer = setupOakServer(service, passwd);

	startServer(serverOpts).then(() => {
		console.log(
			"Antbox Server started successfully on port ::",
			program.options.port ?? "7180",
		);
	});
}

main(program);
