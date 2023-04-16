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
	SYMMETRIC_KEY,
} from "./mod.ts";

import jwk from "./demo.jwk.json" assert { type: "json" };

const ROOT_PASSWD = "demo";
const PORT = 7180;

const program = await new Command()
	.name("demo")
	.version(VERSION)
	.description("Prova de conceito")
	.arguments("[dir]")
	.option("--port <port>", "porta do servidor [7180]")
	.option("--passwd <passwd>", "senha do root [demo]")
	.option("--keys", "imprime as chaves de criptografia")
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

function printKeys(passwd: string, symmetricKey: string, jwk: Record<string, string>) {
	console.log("Root passwd:\t", passwd);

	console.log("Symmetric Key:\t", symmetricKey);
	console.log("JSON Web Key:\t", JSON.stringify(jwk, null, 4));
}

function main(program: IParseResult) {
	const baseDir = program.args?.[0];
	const passwd = program.options.passwd || ROOT_PASSWD;

	if (program.options.keys) {
		printKeys(passwd, SYMMETRIC_KEY, jwk);
		Deno.exit(0);
	}

	if (!baseDir) {
		console.error("No base folder specified");
		Deno.exit(-1);
	}

	const nodeCtx = makeNodeServiceContext(baseDir);
	const service = new AntboxService(nodeCtx);

	const serverOpts: ServerOpts = { port: PORT };
	if (program.options.port) {
		serverOpts.port = parseInt(program.options.port);
	}

	setupOakServer(service, passwd, jwk)
		.then((start) => start(serverOpts))
		.then((evt: unknown) => {
			console.log(
				"Antbox Server started successfully on port ::",
				(evt as Record<string, string>).port,
			);
		});
}

main(program);
