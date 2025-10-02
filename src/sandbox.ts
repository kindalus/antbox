import { Command } from "commander";
import { printServerKeys } from "./print_server_keys.ts";
import { setupTenants } from "setup/setup_tenants.ts";
import { setupOakServer } from "adapters/oak/setup_oak_server.ts";
import { PORT } from "setup/server_defaults.ts";
import process from "node:process";

interface CommandOpts {
	port?: string;
	passwd?: string;
	keys?: boolean;
}

console.warn(
	"⚠️  sandbox.ts is deprecated. Please use the new main.ts entry point:",
);
console.warn(
	"   deno run --allow-net --allow-read --allow-write --allow-env main.ts --sandbox",
);
console.warn("   Or use the shell script: ./start_server.sh --sandbox");
console.warn("");

async function startSandboxServer(opts: CommandOpts) {
	const port = opts.port ? parseInt(opts.port) : PORT;

	// Use hardcoded sandbox configuration for backward compatibility
	const tenants = await setupTenants({
		tenants: [
			{
				name: "sandbox",
				rootPasswd: opts.passwd || "demo",
				symmetricKey: "ui2tPcQZvN+IxXsEW6KQOOFROS6zXB1pZdotBR3Ot8o=",
				jwkPath: ".config/antbox.jwk",
				storage: ["inmem/inmem_storage_provider.ts"],
				repository: ["inmem/inmem_node_repository.ts"],
			},
		],
	});

	const startServer = setupOakServer(tenants);

	startServer({ port }).then((evt: unknown) => {
		console.log(
			"Antbox Sandbox Server started successfully on port ::",
			(evt as Record<string, string>).port,
		);
	});
}

if (import.meta.main) {
	new Command()
		.name("sandbox")
		.description("Legacy sandbox server - use main.ts --sandbox instead")
		.option("--port <port>", "server port [7180]")
		.option("--passwd <passwd>", "root password [demo]")
		.option("--keys", "print cryptographic keys")
		.action((opts) => {
			if (opts.keys) {
				printServerKeys({ passwd: opts.passwd });
				process.exit(0);
			}

			startSandboxServer(opts);
		})
		.parse(process.argv);
}
