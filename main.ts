import { Command } from "commander";
import { printServerKeys } from "./src/print_server_keys.ts";
import { setupTenants } from "setup/setup_tenants.ts";
import { PORT } from "setup/server_defaults.ts";
import { ServerConfiguration } from "api/http_server_configuration.ts";
import process from "node:process";
import { loadConfiguration } from "setup/load_configuration.ts";
import { startPathCacheCleanup } from "integration/webdav/webdav_path_cache.ts";

interface CommandOpts {
	config?: string;
	keys?: boolean;
	demo?: boolean;
	sandbox?: boolean;
}

/**
 * Loads tenants and starts the configured server engine.
 *
 * @remarks
 * External setup:
 * - Ensure the `engine` in the config maps to an adapter under `src/adapters/<engine>/server.ts`.
 * - Grant Deno permissions required by the configured adapters (net, env, read/write).
 *
 * @example
 * await startServer(config);
 */
async function startServer(config: ServerConfiguration) {
	const tenants = await setupTenants({
		tenants: config.tenants,
	});

	// Start WebDAV path cache cleanup (runs every minute)
	startPathCacheCleanup(60000);
	console.log("WebDAV path cache cleanup started");

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
