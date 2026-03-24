import { Command } from "commander";
import { type Logger as AdkLogger, LogLevel, setLogger } from "@google/adk";
import { printServerKeys } from "./src/print_server_keys.ts";
import { setupTenants } from "setup/setup_tenants.ts";
import { PORT } from "setup/server_defaults.ts";
import { ServerConfiguration } from "api/http_server_configuration.ts";
import process from "node:process";
import { loadConfiguration } from "setup/load_configuration.ts";
import { startPathCacheCleanup } from "integration/webdav/webdav_path_cache.ts";
import { Logger } from "shared/logger.ts";

interface CommandOpts {
	configDir?: string;
	keys?: boolean;
	demo?: boolean;
	sandbox?: boolean;
}

interface ListenEvent {
	hostname?: string;
	port?: number;
}

export function getTenantSetupConfiguration(config: ServerConfiguration): ServerConfiguration {
	return config;
}

export function createAdkLogger(): AdkLogger {
	const logger = Logger.instance("ADK");

	return {
		log(level: LogLevel, ...args: unknown[]): void {
			switch (level) {
				case LogLevel.DEBUG:
				case LogLevel.INFO:
					logger.debug(...args);
					break;
				case LogLevel.WARN:
					logger.warn(...args);
					break;
				case LogLevel.ERROR:
					logger.error(...args);
					break;
			}
		},
		debug(...args: unknown[]): void {
			logger.debug(...args);
		},
		info(...args: unknown[]): void {
			logger.debug(...args);
		},
		warn(...args: unknown[]): void {
			logger.warn(...args);
		},
		error(...args: unknown[]): void {
			logger.error(...args);
		},
	};
}

export function configureAdkLogger(): void {
	setLogger(createAdkLogger());
}

function toUrlHost(hostname: string): string {
	if (hostname.includes(":")) {
		return `[${hostname}]`;
	}

	return hostname;
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
async function startServer(config: ServerConfiguration, configDir?: string) {
	let tenants;
	try {
		tenants = await setupTenants(getTenantSetupConfiguration(config));
	} catch (err) {
		console.error("Failed to setup tenants on startup:", err);
		Deno.exit(-1);
	}

	const reloadFn = async () => {
		const newConfig = await loadConfiguration(configDir);
		const newTenants = await setupTenants(getTenantSetupConfiguration(newConfig));
		tenants.splice(0, tenants.length, ...newTenants);
	};

	// Start WebDAV path cache cleanup (runs every minute)
	startPathCacheCleanup(60000);
	console.log("WebDAV path cache cleanup started");

	const serverLocation = `adapters/${config.engine}/server.ts`;
	let startServerFn;
	try {
		const setupServer = await import(`./src/${serverLocation}`);
		startServerFn = setupServer.default(tenants, reloadFn, configDir);
	} catch (error) {
		console.error(`Failed to load server engine module: ${serverLocation}`);
		console.error(error);
		Deno.exit(1);
	}

	const port = config.port || PORT;

	startServerFn({ port }).then((evt: unknown) => {
		const listenEvent = evt as ListenEvent;
		const effectiveHostname = toUrlHost(listenEvent.hostname ?? "localhost");
		const effectivePort = listenEvent.port ?? port;
		const baseUrl = `http://${effectiveHostname}:${effectivePort}`;

		console.log(
			`Antbox Server (${config.engine}) started successfully on ${baseUrl}`,
		);
		console.log(`- ${baseUrl}/v2 for REST API`);
		console.log(`- ${baseUrl}/mcp for MCP`);
		console.log(`- ${baseUrl}/webdav for WebDAV`);
	});
}

if (import.meta.main) {
	new Command()
		.name("antbox")
		.description("Antbox ECM Server")
		.option(
			"-c, --config-dir <dir>",
			"configuration directory path",
		)
		.option("--keys", "print crypto keys and exit")
		.option("--demo", "run with demo configuration")
		.option("--sandbox", "run with sandbox configuration")
		.action(async (opts: CommandOpts) => {
			configureAdkLogger();

			let configDir = opts.configDir;

			if (opts.demo) {
				configDir = "./.config/demo";
			} else if (opts.sandbox) {
				configDir = "./.config/sandbox";
			}

			if (opts.keys) {
				printServerKeys({ configDir });
				Deno.exit(0);
			}

			const config = await loadConfiguration(configDir);
			await startServer(config, configDir);
		})
		.parse(process.argv);
}
