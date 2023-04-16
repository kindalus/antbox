import { VERSION } from "./version.ts";

import { Command, IParseResult } from "/deps/command";

import {
	AntboxService,
	DefaultFidGenerator,
	DefaultUuidGenerator,
	InMemoryNodeRepository,
	InMemoryStorageProvider,
	ServerOpts,
	setupOakServer,
	SYMMETRIC_KEY,
} from "./mod.ts";

import jwk from "./demo.jwk.json" assert { type: "json" };

const ROOT_PASSWD = "demo";

const program = await new Command()
	.name("sandbox")
	.version(VERSION)
	.description("Prova de conceito em memória")
	.option("--port <port>", "porta do servidor [7180]")
	.option("--passwd <passwd>", "senha do root [demo]")
	.option("--keys", "imprime as chaves de criptografia")
	.parse(Deno.args);

function printKeys(passwd: string, symmetricKey: string, jwk: Record<string, string>) {
	console.log("Root passwd:\t", passwd);

	console.log("Symmetric Key:\t", symmetricKey);
	console.log("JSON Web Key:\t", JSON.stringify(jwk, null, 4));
}

async function main(program: IParseResult) {
	const passwd = program.options.passwd || ROOT_PASSWD;

	if (program.options.keys) {
		printKeys(passwd, SYMMETRIC_KEY, jwk);
		Deno.exit(0);
	}

	const service = new AntboxService({
		uuidGenerator: new DefaultUuidGenerator(),
		fidGenerator: new DefaultFidGenerator(),
		repository: new InMemoryNodeRepository(),
		storage: new InMemoryStorageProvider(),
	});

	const serverOpts: ServerOpts = {};
	if (program.options.port) {
		serverOpts.port = parseInt(program.options.port);
	}

	const startServer = await setupOakServer(service, passwd, jwk);

	startServer(serverOpts).then(() => {
		console.log(
			"Antbox Server started successfully on port ::",
			program.options.port ?? "7180",
		);
	});
}

await main(program);
