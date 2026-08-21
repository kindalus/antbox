import { stringify } from "toml";
import { dirname, join } from "node:path";
import { getDefaultConfigDir } from "./load_configuration.ts";
import {
	type TenantConfiguration,
	TenantsConfigurationSchema,
} from "api/http_server_configuration.ts";
import { readTenantConfigurationState } from "./tenant_configuration_files.ts";

interface FileChange {
	path: string;
	text?: string;
}

export async function saveTenantConfiguration(
	configDir: string | undefined,
	tenants: TenantConfiguration[],
	reload?: () => Promise<void>,
): Promise<void> {
	const validation = TenantsConfigurationSchema.safeParse(tenants);
	if (!validation.success) throw validation.error;

	const dir = configDir ?? getDefaultConfigDir();
	const state = await readTenantConfigurationState(dir);
	const desired = new Map(validation.data.map((tenant) => [tenant.name, tenant]));
	const inlineNames = new Set(state.inlineTenants.map((tenant) => tenant.name));
	const changes = new Map<string, FileChange>();
	const nextInline: TenantConfiguration[] = [];
	let inlineChanged = false;

	for (const current of state.inlineTenants) {
		const replacement = desired.get(current.name);
		if (!replacement) {
			inlineChanged = true;
			continue;
		}
		if (state.fileTenants.has(current.name)) {
			nextInline.push(current);
			continue;
		}
		nextInline.push(replacement);
		if (!configurationsEqual(current, replacement)) inlineChanged = true;
	}

	for (const tenant of validation.data) {
		const external = state.fileTenants.get(tenant.name);
		if (external) {
			if (!configurationsEqual(external.config, tenant)) {
				changes.set(external.path, { path: external.path, text: tenantToml(tenant) });
			}
			continue;
		}
		if (inlineNames.has(tenant.name)) continue;
		if (!state.tenantsDir) {
			throw new Error("Cannot create a tenant file because tenants.d is unavailable");
		}
		const path = join(state.tenantsDir, `${tenant.name}.toml`);
		changes.set(path, { path, text: tenantToml(tenant) });
	}

	for (const [name, external] of state.fileTenants) {
		if (!desired.has(name)) changes.set(external.path, { path: external.path });
	}

	if (inlineChanged) {
		const rawConfig = structuredClone(state.rawConfig);
		if (nextInline.length > 0) rawConfig.tenants = nextInline;
		else delete rawConfig.tenants;
		changes.set(state.configPath, { path: state.configPath, text: stringify(rawConfig) });
	}

	await applyChanges([...changes.values()], reload);
}

function tenantToml(tenant: TenantConfiguration): string {
	return stringify({ ...tenant });
}

function configurationsEqual(
	left: TenantConfiguration,
	right: TenantConfiguration,
): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}

async function applyChanges(
	changes: FileChange[],
	reload?: () => Promise<void>,
): Promise<void> {
	const originals = new Map<string, string | undefined>();
	const staged = new Map<string, string>();

	try {
		for (const change of changes) {
			originals.set(change.path, await readIfExists(change.path));
			if (change.text !== undefined) {
				const tempPath = await Deno.makeTempFile({
					dir: dirname(change.path),
					prefix: ".tenant-",
				});
				staged.set(change.path, tempPath);
				await Deno.writeTextFile(tempPath, change.text);
			}
		}

		for (const change of changes) {
			const tempPath = staged.get(change.path);
			if (!tempPath) {
				await removeIfExists(change.path);
				continue;
			}
			try {
				await Deno.rename(tempPath, change.path);
			} catch (error) {
				if (!(error instanceof Deno.errors.AlreadyExists)) throw error;
				await Deno.remove(change.path);
				await Deno.rename(tempPath, change.path);
			}
			staged.delete(change.path);
		}

		await reload?.();
	} catch (error) {
		const rollbackErrors: unknown[] = [];
		for (const [path, text] of originals) {
			try {
				if (text === undefined) await removeIfExists(path);
				else await Deno.writeTextFile(path, text);
			} catch (rollbackError) {
				rollbackErrors.push(rollbackError);
			}
		}
		if (rollbackErrors.length > 0) {
			throw new AggregateError(
				[error, ...rollbackErrors],
				"Tenant configuration update and rollback failed",
			);
		}
		throw error;
	} finally {
		for (const tempPath of staged.values()) await removeIfExists(tempPath);
	}
}

async function readIfExists(path: string): Promise<string | undefined> {
	try {
		return await Deno.readTextFile(path);
	} catch (error) {
		if (error instanceof Deno.errors.NotFound) return undefined;
		throw error;
	}
}

async function removeIfExists(path: string): Promise<void> {
	try {
		await Deno.remove(path);
	} catch (error) {
		if (!(error instanceof Deno.errors.NotFound)) throw error;
	}
}
