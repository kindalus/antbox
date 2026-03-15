import { parse, stringify } from "toml";
import { join } from "node:path";
import { getDefaultConfigDir } from "./load_configuration.ts";
import type { TenantConfiguration } from "api/http_server_configuration.ts";

export async function saveTenantConfiguration(
	configDir: string | undefined,
	tenants: TenantConfiguration[],
): Promise<void> {
	const dir = configDir ?? getDefaultConfigDir();
	const configPath = join(dir, "config.toml");
	const text = await Deno.readTextFile(configPath);
	const config = parse(text) as Record<string, unknown>;
	config.tenants = tenants;
	await Deno.writeTextFile(configPath, stringify(config));
}
