import type { ModuleConfiguration } from "api/http_server_configuration.ts";
import type { AntboxError } from "shared/antbox_error.ts";
import type { Either } from "shared/either.ts";

/**
 * Loads and instantiates an adapter module from a ModuleConfiguration tuple.
 *
 * @remarks
 * External setup:
 * - Ensure the module path is resolvable (relative to `adapters/`, absolute, or URL).
 * - Grant the process the file or network access the module requires.
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
		throw new Error(`Could not load module`);
	}

	const providerOrErr = await mod(...params);
	if (providerOrErr.isLeft()) {
		throw new Error(`Could not initialize provider: ${providerOrErr.value}`);
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
			throw new Error(`Module [${path}] has no default export`);
		}

		return m.default;
	} catch (e) {
		throw new Error(`Could not load module [${path}]: ${e}`);
	}
}
