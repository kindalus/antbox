import type { ModuleConfiguration, TenantConfiguration } from "api/http_server_configuration.ts";
import { isAbsolute, join, resolve } from "node:path";

const DATA_PATH_PARAMETERS = new Map<string, readonly number[]>([
	["flat_file/flat_file_storage_provider.ts", [1]],
	["flat_file/flat_file_node_repository.ts", [1]],
	["flat_file/flat_file_event_store_repository.ts", [1]],
	["sqlite/sqlite_node_repository.ts", [1]],
	["sqlite/sqlite_configuration_repository.ts", [1]],
	["sqlite/sqlite_event_store_repository.ts", [1]],
]);

const CONFIG_PATH_PARAMETERS = new Map<string, readonly number[]>([
	["google_drive/google_drive_storage_provider.ts", [1]],
	["s3/s3_storage_provider.ts", [1]],
]);

export function getDefaultDataDir(): string {
	const home = Deno.env.get("HOME") || Deno.env.get("USERPROFILE") || "";
	return join(home, ".local", "share", "antbox");
}

export function resolveDataPath(dataDir: string, value: string): string {
	if (isAbsolute(value)) return value;
	if (!value.trim()) throw new Error("Data path must not be empty");
	if (value.split(/[\\/]+/).includes("..")) {
		throw new Error(`Data path must not contain '..': ${value}`);
	}
	return resolve(dataDir, value);
}

export function resolveConfigPath(configDir: string, value: string): string {
	return isAbsolute(value) ? value : resolve(configDir, value);
}

export function resolveTenantConfigurationPaths(
	tenant: TenantConfiguration,
	configDir: string,
	dataDir: string,
): void {
	resolveModulePaths(
		tenant.storage,
		DATA_PATH_PARAMETERS,
		(value) => resolveDataPath(dataDir, value),
	);
	resolveModulePaths(
		tenant.repository,
		DATA_PATH_PARAMETERS,
		(value) => resolveDataPath(dataDir, value),
	);
	resolveModulePaths(
		tenant.configurationRepository,
		DATA_PATH_PARAMETERS,
		(value) => resolveDataPath(dataDir, value),
	);
	resolveModulePaths(
		tenant.eventStoreRepository,
		DATA_PATH_PARAMETERS,
		(value) => resolveDataPath(dataDir, value),
	);

	resolveModulePaths(
		tenant.storage,
		CONFIG_PATH_PARAMETERS,
		(value) => resolveConfigPath(configDir, value),
	);

	if (tenant.key) tenant.key = resolveConfigPath(configDir, tenant.key);
	if (tenant.jwks && !tenant.jwks.startsWith("http://") && !tenant.jwks.startsWith("https://")) {
		tenant.jwks = resolveConfigPath(configDir, tenant.jwks);
	}
	if (tenant.ai?.skillsPath) {
		tenant.ai.skillsPath = resolveConfigPath(configDir, tenant.ai.skillsPath);
	}
	if (tenant.ai?.modelsPath) {
		tenant.ai.modelsPath = resolveConfigPath(configDir, tenant.ai.modelsPath);
	}
	if (tenant.ai?.enabled) {
		tenant.ai.sessionsPath = tenant.ai.sessionsPath
			? resolveDataPath(dataDir, tenant.ai.sessionsPath)
			: resolveDataPath(dataDir, `${tenant.name}/ai-sessions`);
	}
}

function resolveModulePaths(
	configuration: ModuleConfiguration | undefined,
	pathParameters: ReadonlyMap<string, readonly number[]>,
	resolvePath: (value: string) => string,
): void {
	if (!configuration) return;
	for (const index of pathParameters.get(configuration[0]) ?? []) {
		const value = configuration[index];
		if (value !== undefined) configuration[index] = resolvePath(value);
	}
}
