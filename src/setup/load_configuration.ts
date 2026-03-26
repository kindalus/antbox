import { Logger } from "shared/logger.ts";
import { ServerConfiguration } from "api/http_server_configuration.ts";
import { fileExistsSync } from "shared/os_helpers.ts";
import { PORT } from "./server_defaults.ts";
import { parse } from "toml";
import { join } from "node:path";
import { exportJWK, generateKeyPair } from "jose";
import { encodeBase64 } from "jsr:@std/encoding@1.0.10/base64";

/**
 * Resolves the default configuration directory.
 * Unix: $HOME/.config/antbox
 * Windows: %USERPROFILE%/.config/antbox
 */
export function getDefaultConfigDir(): string {
	const home = Deno.env.get("HOME") || Deno.env.get("USERPROFILE") || "";
	return join(home, ".config", "antbox");
}

/**
 * Loads the server configuration from the given configuration directory.
 * If the directory or config files are missing, they will be auto-generated.
 *
 * @remarks
 * External setup:
 * - Provide a valid config directory path, or leave undefined for default.
 * - Ensure Deno has `--allow-read` and `--allow-write` for the config dir.
 *
 * @example
 * const config = await loadConfiguration("/var/lib/antbox");
 */
export async function loadConfiguration(
	configDir?: string,
): Promise<ServerConfiguration> {
	const dir = configDir || getDefaultConfigDir();

	if (!fileExistsSync(dir)) {
		Deno.mkdirSync(dir, { recursive: true });
		Logger.info(`Created configuration directory: ${dir}`);
	}

	const dataDir = join(dir, "data");
	if (!fileExistsSync(dataDir)) {
		Deno.mkdirSync(dataDir, { recursive: true });
	}

	const configPath = join(dir, "config.toml");
	if (!fileExistsSync(configPath)) {
		const defaultConfig = `engine = "oak"
port = 7180
logLevel = "info"
rootPasswd = "demo"
key = "antbox.key"
jwks = "antbox.jwks"

[[tenants]]
name = "default"
storage = ["flat_file/flat_file_storage_provider.ts", "./data/storage"]
repository = ["sqlite/sqlite_node_repository.ts", "./data/repository"]
configurationRepository = ["sqlite/sqlite_configuration_repository.ts", "./data/config"]
eventStoreRepository = ["sqlite/sqlite_event_store_repository.ts", "./data/events"]

[tenants.limits]
storage = "pay-as-you-go"
tokens = 0
`;
		await Deno.writeTextFile(configPath, defaultConfig);
		Logger.info(`Created default configuration file: ${configPath}`);
	}

	const keyPath = join(dir, "antbox.key");
	if (!fileExistsSync(keyPath)) {
		const randomBytes = new Uint8Array(32);
		crypto.getRandomValues(randomBytes);
		await Deno.writeTextFile(keyPath, encodeBase64(randomBytes));
		Logger.info(`Generated new symmetric key at: ${keyPath}`);
	}

	const jwksPath = join(dir, "antbox.jwks");
	const privateJwkPath = join(dir, "antbox-private.jwk");
	if (!fileExistsSync(jwksPath) || !fileExistsSync(privateJwkPath)) {
		const { publicKey, privateKey } = await generateKeyPair("ES256", { extractable: true });
		const pubJwk = { ...(await exportJWK(publicKey)), alg: "ES256", kid: "antbox-auto-key" };
		const privJwk = { ...(await exportJWK(privateKey)), alg: "ES256", kid: "antbox-auto-key" };

		await Deno.writeTextFile(jwksPath, JSON.stringify({ keys: [pubJwk] }, null, 2));
		await Deno.writeTextFile(privateJwkPath, JSON.stringify(privJwk, null, 2));
		Logger.info(`Generated new JWKS at: ${jwksPath}`);
	}

	const configText = await Deno.readTextFile(configPath);
	const config = parse(configText) as unknown as ServerConfiguration;

	if (!config.port) config.port = PORT;

	if (config.logLevel && !Deno.env.has("ANTBOX_LOG_LEVEL")) {
		Deno.env.set("ANTBOX_LOG_LEVEL", config.logLevel);
	}

	// Make base paths absolute based on configDir if they aren't already
	if (config.key && !config.key.startsWith("/")) {
		config.key = join(dir, config.key);
	} else if (!config.key) {
		config.key = keyPath;
	}

	if (config.jwks && !config.jwks.startsWith("/") && !config.jwks.startsWith("http")) {
		config.jwks = join(dir, config.jwks);
	} else if (!config.jwks) {
		config.jwks = jwksPath;
	}

	const resolveModuleParams = (modConfig: [string, ...string[]] | undefined) => {
		if (!modConfig) return;
		for (let i = 1; i < modConfig.length; i++) {
			if (modConfig[i].startsWith("./") || modConfig[i].startsWith("../")) {
				modConfig[i] = join(dir, modConfig[i]);
			}
		}
	};

	for (const tenant of config.tenants) {
		if (tenant.key && !tenant.key.startsWith("/")) {
			tenant.key = join(dir, tenant.key);
		}
		if (tenant.jwks && !tenant.jwks.startsWith("/") && !tenant.jwks.startsWith("http")) {
			tenant.jwks = join(dir, tenant.jwks);
		}

		resolveModuleParams(tenant.storage);
		resolveModuleParams(tenant.repository);
		resolveModuleParams(tenant.configurationRepository);
		resolveModuleParams(tenant.eventStoreRepository);
	}

	return config;
}
