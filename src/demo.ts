import { Command } from "commander";
import { printServerKeys } from "./print_server_keys.ts";
import { setupTenants } from "setup/setup_tenants.ts";
import setupOakServer from "adapters/oak/server.ts";
import { PORT } from "setup/server_defaults.ts";
import process from "node:process";

interface CommandOpts {
	port?: string;
	passwd?: string;
	keys?: boolean;
}

console.warn(
	"⚠️  demo.ts is deprecated. Please use the new main.ts entry point:",
);
console.warn(
	"   deno run --allow-net --allow-read --allow-write --allow-env main.ts --demo",
);
console.warn("   Or use the shell script: ./start_server.sh --demo");
console.warn("");

async function startDemoServer(opts: CommandOpts) {
	const port = opts.port ? parseInt(opts.port) : PORT;

	// Use hardcoded demo configuration for backward compatibility
	const tenants = await setupTenants({
		tenants: [
			{
				name: "demo",
				rootPasswd: opts.passwd || "demo",
				key: "ui2tPcQZvN+IxXsEW6KQOOFROS6zXB1pZdotBR3Ot8o=",
				jwk: ".config/antbox.jwk",
				storage: [
					"flat_file/flat_file_storage_provider.ts",
					"./data/storage",
				],
				repository: [
					"flat_file/flat_file_node_repository.ts",
					"./data/repository",
				],
			},
		],
	});

	const startServer = setupOakServer(tenants);

	startServer({ port }).then((evt: unknown) => {
		console.log(
			"Antbox Demo Server started successfully on port ::",
			(evt as Record<string, string>).port,
		);
	});
}

if (import.meta.main) {
	new Command()
		.name("demo")
		.description("Legacy demo server - use main.ts --demo instead")
		.option("--port <port>", "server port [7180]")
		.option("--passwd <passwd>", "root password [demo]")
		.option("--keys", "print cryptographic keys")
		.action((opts) => {
			if (opts.keys) {
				printServerKeys({ passwd: opts.passwd });
				Deno.exit(0);
			}

			startDemoServer(opts);
		})
		.parse(process.argv);
}
