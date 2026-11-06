import { existsSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseConfiguration, ModuleConfiguration } from "api/http_server_configuration.ts";

export interface DatabaseModules {
	repository: ModuleConfiguration;
	configurationRepository: ModuleConfiguration;
	eventStoreRepository: ModuleConfiguration;
}

/** Maps a tenant `database` entry to the three repository modules of that backend. */
export function databaseModules([kind, ...params]: DatabaseConfiguration): DatabaseModules {
	return {
		repository: [`${kind}/${kind}_node_repository.ts`, ...params],
		configurationRepository: [`${kind}/${kind}_configuration_repository.ts`, ...params],
		eventStoreRepository: [`${kind}/${kind}_event_store_repository.ts`, ...params],
	};
}

const LEGACY_SQLITE_FILES = [
	["repository", "nodes.db"],
	["config", "config.db"],
	["events", "events.db"],
] as const;

/**
 * Refuses to start on a SQLite folder still laid out as `<x>/repository/nodes.db`, which would
 * otherwise silently open empty databases. Lists the moves to make; moves nothing.
 */
export function assertNoLegacySqliteLayout(
	tenantName: string,
	[kind, folder]: DatabaseConfiguration,
): void {
	if (kind !== "sqlite" || folder === undefined) return;

	const moves = LEGACY_SQLITE_FILES
		.map(([directory, file]) => ({ from: join(folder, directory, file), to: join(folder, file) }))
		.filter(({ from, to }) => existsSync(from) && !existsSync(to));
	if (moves.length === 0) return;

	throw new Error(
		`Tenant ${tenantName}: SQLite databases found in the legacy layout under ${folder}. ` +
			`Antbox would start empty. Stop the server and move them:\n` +
			moves.map(({ from }) => `  mv ${from}* ${folder}/`).join("\n") +
			"\n(the * also moves the -wal and -shm files)",
	);
}
