import { Command } from "commander";
import { printServerKeys } from "./src/print_server_keys.ts";
import { setupTenants } from "setup/setup_tenants.ts";
import { PORT } from "setup/server_defaults.ts";
import { parse } from "toml";
import { fileExistsSync } from "shared/os_helpers.ts";
import { ServerConfiguration } from "api/http_server_configuration.ts";
import process from "node:process";

interface CommandOpts {
	config?: string;
	keys?: boolean;
	demo?: boolean;
	sandbox?: boolean;
}

async function loadConfiguration(
	configPath: string,
): Promise<ServerConfiguration> {
	if (!(fileExistsSync(configPath))) {
		console.error(`Configuration file not found: ${configPath}`);
		Deno.exit(1);
	}

	const configText = await Deno.readTextFile(configPath);
	const config = parse(configText) as unknown as ServerConfiguration;

	if (!config.port) config.port = PORT;

	return config;
}

async function startServer(config: ServerConfiguration) {
	const tenants = await setupTenants({
		tenants: config.tenants,
	});

	const serverLocation = `adapters/${config.engine}/server.ts`;
	let startServerFn;
	try {
		const setupServer = await import(`./src/${serverLocation}`);
		startServerFn = setupServer.default(tenants);
	} catch (error) {
		console.error(`Failed to load server engine module: ${serverLocation}`);
		console.error(error);
		Deno.exit(1);
	}

	const port = config.port || PORT;

	startServerFn({ port }).then((evt: unknown) => {
		console.log(
			`Antbox Server (${config.engine}) started successfully on port ::`,
			(evt as Record<string, string>).port,
		);
	});
}

if (import.meta.main) {
	new Command()
		.name("antbox")
		.description("Antbox ECM Server")
		.option(
			"-f, --config <file>",
			"configuration file path",
			"./.config/antbox.toml",
		)
		.option("--keys", "print crypto keys and exit")
		.option("--demo", "run with demo configuration")
		.option("--sandbox", "run with sandbox configuration")
		.action(async (opts: CommandOpts) => {
			if (opts.keys) {
				printServerKeys({});
				Deno.exit(0);
			}

			let configPath = opts.config || "./.config/antbox.toml";

			if (opts.demo) {
				configPath = "./.config/demo.toml";
			} else if (opts.sandbox) {
				configPath = "./.config/sandbox.toml";
			}

			const config = await loadConfiguration(configPath);
			await startServer(config);
		})
		.parse(process.argv);
}
