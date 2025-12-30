import type { ModuleConfiguration } from "api/http_server_configuration.ts";
import type { AntboxError } from "shared/antbox_error.ts";
import type { Either } from "shared/either.ts";
import { Logger } from "shared/logger.ts";

/**
 * Loads and instantiates an adapter module from a ModuleConfiguration tuple.
 *
 * @remarks
 * External setup:
 * - Ensure the module path is resolvable (relative to `adapters/`, absolute, or URL).
 * - Grant Deno permissions for file or network access as required by the module.
 *
 * @param cfg Tuple of `[modulePath, ...params]` used to load and call the adapter factory.
 *
 * @example
 * const repo = await providerFrom<NodeRepository>([
 *   "postgres/postgres_node_repository.ts",
 *   "postgres://user:pass@host/db",
 * ]);
 */
export async function providerFrom<T>(
	cfg?: ModuleConfiguration,
): Promise<T | undefined> {
	if (!cfg) {
		return;
	}

	const [modulePath, ...params] = cfg;
	const mod = await loadModule<T>(modulePath);
	if (!mod) {
		Logger.error("could not load module");
		Deno.exit(-1);
	}

	const providerOrErr = await mod(...params);
	if (providerOrErr.isLeft()) {
		Logger.error("could not load provider");
		Logger.error(providerOrErr.value);
		Deno.exit(-1);
	}

	return providerOrErr.value;
}

async function loadModule<T>(
	modulePath: string,
): Promise<(...p: string[]) => Promise<Either<AntboxError, T>>> {
	const path = modulePath.match(/^(\.?\/|https?:\/\/)/) ? modulePath : `adapters/${modulePath}`;

	try {
		const m = await import(path);

		if (!m.default) {
			Logger.error(`module [${path}] has no default export`);
			Deno.exit(-1);
		}

		return m.default;
	} catch (e) {
		Logger.error("could not load module");
		Logger.error(e);
		Deno.exit(-1);
	}
}
