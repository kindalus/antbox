import { join } from "node:path";
import { parse } from "toml";
import {
	type TenantConfiguration,
	TenantConfigurationSchema,
} from "api/http_server_configuration.ts";
import { Logger } from "shared/logger.ts";

export const TENANTS_DIRECTORY = "tenants.d";
export const TENANT_SAMPLE_FILE = "tenant.toml.sample";

export const TENANT_SAMPLE = `name = "tenant"
storage = ["flat_file/flat_file_storage_provider.ts", "./data/tenant/storage"]
repository = ["sqlite/sqlite_node_repository.ts", "./data/tenant/repository"]
configurationRepository = ["sqlite/sqlite_configuration_repository.ts", "./data/tenant/configuration"]
eventStoreRepository = ["sqlite/sqlite_event_store_repository.ts", "./data/tenant/events"]

[limits]
storage = "pay-as-you-go"
tokens = 0
`;

export interface TenantFileConfiguration {
	config: TenantConfiguration;
	path: string;
}

export interface TenantConfigurationState {
	configPath: string;
	rawConfig: Record<string, unknown>;
	inlineTenants: TenantConfiguration[];
	fileTenants: Map<string, TenantFileConfiguration>;
	effectiveTenants: TenantConfiguration[];
	tenantsDir?: string;
	adminTenantName: string | null;
}

export async function readTenantConfigurationState(
	configDir: string,
): Promise<TenantConfigurationState> {
	const configPath = join(configDir, "config.toml");
	const configText = await Deno.readTextFile(configPath);
	const rawConfig = parseToml(configText, configPath);
	const inlineTenants = validateInlineTenants(rawConfig.tenants, configPath);
	const tenantsDir = await ensureTenantsDirectory(configDir);
	const fileTenants = tenantsDir ? await readTenantFiles(tenantsDir) : new Map();
	const inlineNames = new Set(inlineTenants.map((tenant) => tenant.name));
	const effectiveTenants = inlineTenants.map((tenant) => {
		const external = fileTenants.get(tenant.name);
		if (external) {
			Logger.warn(
				`Tenant ${tenant.name} from ${external.path} overrides its definition in ${configPath}`,
			);
			return external.config;
		}
		return tenant;
	});

	for (const [name, external] of fileTenants) {
		if (!inlineNames.has(name)) effectiveTenants.push(external.config);
	}

	if (effectiveTenants.length === 0) {
		throw configurationError(configPath, "at least one tenant is required");
	}

	const adminTenantName = effectiveTenants.some((tenant) => tenant.name === "default")
		? "default"
		: inlineTenants[0]?.name ?? null;
	if (adminTenantName === null) {
		Logger.warn("No administrative tenant is configured");
	}

	return {
		configPath,
		rawConfig,
		inlineTenants,
		fileTenants,
		effectiveTenants,
		tenantsDir,
		adminTenantName,
	};
}

async function ensureTenantsDirectory(configDir: string): Promise<string | undefined> {
	const tenantsDir = join(configDir, TENANTS_DIRECTORY);
	let stat: Deno.FileInfo | undefined;
	try {
		stat = await Deno.stat(tenantsDir);
	} catch (error) {
		if (!(error instanceof Deno.errors.NotFound)) {
			throw configurationError(tenantsDir, `cannot inspect directory: ${error}`);
		}
	}

	if (!stat) {
		try {
			await Deno.mkdir(tenantsDir, { recursive: true });
			Logger.info(`Created tenant configuration directory: ${tenantsDir}`);
		} catch (error) {
			Logger.warn(`Cannot create tenant configuration directory ${tenantsDir}: ${error}`);
			return undefined;
		}
	} else if (!stat.isDirectory) {
		throw configurationError(tenantsDir, "path exists but is not a directory");
	}

	await ensureSample(tenantsDir);
	return tenantsDir;
}

async function ensureSample(tenantsDir: string): Promise<void> {
	const samplePath = join(tenantsDir, TENANT_SAMPLE_FILE);
	try {
		await Deno.writeTextFile(samplePath, TENANT_SAMPLE, { createNew: true });
		Logger.info(`Created tenant configuration sample: ${samplePath}`);
	} catch (error) {
		if (!(error instanceof Deno.errors.AlreadyExists)) {
			Logger.warn(`Cannot create tenant configuration sample ${samplePath}: ${error}`);
		}
	}
}

async function readTenantFiles(
	tenantsDir: string,
): Promise<Map<string, TenantFileConfiguration>> {
	let entries: Deno.DirEntry[];
	try {
		entries = [];
		for await (const entry of Deno.readDir(tenantsDir)) {
			if (entry.isFile && entry.name.endsWith(".toml")) entries.push(entry);
		}
	} catch (error) {
		throw configurationError(tenantsDir, `cannot read directory: ${error}`);
	}

	entries.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
	const tenants = new Map<string, TenantFileConfiguration>();
	for (const entry of entries) {
		const path = join(tenantsDir, entry.name);
		let text: string;
		try {
			text = await Deno.readTextFile(path);
		} catch (error) {
			throw configurationError(path, `cannot read file: ${error}`);
		}
		const raw = parseToml(text, path);
		const config = validateTenant(raw, path);
		const expectedName = entry.name.slice(0, -".toml".length);
		if (config.name !== expectedName) {
			throw configurationError(
				path,
				`tenant name ${config.name} must match filename ${expectedName}`,
			);
		}
		tenants.set(config.name, { config, path });
	}
	return tenants;
}

function validateInlineTenants(value: unknown, path: string): TenantConfiguration[] {
	if (value === undefined) return [];
	if (!Array.isArray(value)) throw configurationError(path, "tenants must be an array");

	const tenants = value.map((tenant, index) => validateTenant(tenant, `${path} tenant ${index}`));
	const names = new Set<string>();
	for (const tenant of tenants) {
		if (names.has(tenant.name)) {
			throw configurationError(path, `duplicate tenant name: ${tenant.name}`);
		}
		names.add(tenant.name);
	}
	return tenants;
}

function validateTenant(value: unknown, path: string): TenantConfiguration {
	const validation = TenantConfigurationSchema.safeParse(value);
	if (!validation.success) {
		const details = validation.error.issues.map((issue) => {
			const field = issue.path.length ? `${issue.path.join(".")}: ` : "";
			return `${field}${issue.message}`;
		}).join("; ");
		throw configurationError(path, details);
	}
	return validation.data;
}

function parseToml(text: string, path: string): Record<string, unknown> {
	try {
		return parse(text);
	} catch (error) {
		throw configurationError(path, `invalid TOML: ${error}`);
	}
}

function configurationError(path: string, message: string): Error {
	const error = new Error(`Invalid configuration at ${path}: ${message}`);
	Logger.error(error.message);
	return error;
}
