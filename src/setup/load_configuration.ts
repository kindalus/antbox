import { Logger } from "shared/logger.ts";
import { ServerConfiguration } from "api/http_server_configuration.ts";
import { fileExistsSync } from "shared/os_helpers.ts";
import { PORT } from "./server_defaults.ts";
import { parse } from "toml";

/**
 * Loads the server configuration from a TOML file.
 *
 * @remarks
 * External setup:
 * - Provide a valid TOML config file path.
 * - Ensure Deno has `--allow-read` for the config file.
 *
 * @example
 * const config = await loadConfiguration("./.config/antbox.toml");
 */
export async function loadConfiguration(
	configPath: string,
): Promise<ServerConfiguration> {
	if (!(fileExistsSync(configPath))) {
		Logger.error(`Configuration file not found: ${configPath}`);
		Deno.exit(1);
	}

	const configText = await Deno.readTextFile(configPath);
	const config = parse(configText) as unknown as ServerConfiguration;

	if (!config.port) config.port = PORT;

	return config;
}
