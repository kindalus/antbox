import { ServerConfiguration } from "api/http_server_configuration.ts";
import { fileExistsSync } from "shared/os_helpers.ts";
import { PORT } from "./server_defaults.ts";
import { parse } from "toml";

export async function loadConfiguration(
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
