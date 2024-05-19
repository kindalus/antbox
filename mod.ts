import { AntboxTenant, setupOakServer } from "./src/adapters/oak/setup_oak_server.ts";
import { Either } from "./src/shared/either.ts";
import { AntboxError } from "./src/shared/antbox_error.ts";
import { InMemoryNodeRepository } from "./src/adapters/inmem/inmem_node_repository.ts";
import { InMemoryStorageProvider } from "./src/adapters/inmem/inmem_storage_provider.ts";
import { DefaultFidGenerator } from "./src/adapters/strategies/default_fid_generator.ts";
import { DefaultUuidGenerator } from "./src/adapters/strategies/default_uuid_generator.ts";
import { AntboxService } from "./src/application/antbox_service.ts";

import defaultJwk from "./demo.jwk.json" with { type: "json" };

const SYMMETRIC_KEY = "ui2tPcQZvN+IxXsEW6KQOOFROS6zXB1pZdotBR3Ot8o=";
const ROOT_PASSWD = "demo";
const PORT = 7180;

export type ModuleConfiguration = [modulePath: string, ...params: string[]];
export interface TenantConfiguration {
	name: string;
	rootPasswd?: string;
	symmetricKey?: string;
	jwkPath?: string;
	storage?: ModuleConfiguration;
	repository?: ModuleConfiguration;
}

export interface ServerOpts {
	port?: number;
	tenants: TenantConfiguration[];
}

function setupTenants(o: ServerOpts): Promise<AntboxTenant[]> {
	return Promise.all(
		o.tenants.map(async (cfg) => {
			const passwd = cfg?.rootPasswd ?? ROOT_PASSWD;
			const symmetricKey = cfg?.symmetricKey ?? SYMMETRIC_KEY;

			const jwk = await loadJwk(cfg?.jwkPath);

			const service = new AntboxService({
				uuidGenerator: new DefaultUuidGenerator(),
				fidGenerator: new DefaultFidGenerator(),
				repository: (await providerFrom(cfg?.repository)) ?? new InMemoryNodeRepository(),
				storage: (await providerFrom(cfg?.storage)) ?? new InMemoryStorageProvider(),
			});

			return {
				name: cfg.name,
				service,
				rootPasswd: passwd,
				symmetricKey,
				rawJwk: jwk,
			};
		}),
	);
}

export async function startServer(opts: ServerOpts) {
	const tenants = await setupTenants(opts);
	const port = opts?.port ?? PORT;

	setupOakServer(tenants)
		.then((start) => start({ port }))
		.then((evt: unknown) => {
			console.log(
				"Antbox Server started successfully on port ::",
				(evt as Record<string, string>).port,
			);
		});
}

export async function printKeys(opts?: {
	passwd?: string;
	symmetricKey?: string;
	jwkPath?: string;
}) {
	console.log("Root passwd:\t", opts?.passwd ?? ROOT_PASSWD);

	console.log("Symmetric Key:\t", opts?.symmetricKey ?? SYMMETRIC_KEY);
	console.log(
		"JSON Web Key:\t",
		JSON.stringify(await loadJwk(opts?.jwkPath), null, 4),
	);
}

async function loadJwk(jwkPath?: string): Promise<Record<string, string>> {
	if (!jwkPath) {
		return defaultJwk;
	}

	const jwk = await Deno.readTextFile(jwkPath);
	return JSON.parse(jwk);
}

export async function providerFrom<T>(
	cfg?: ModuleConfiguration,
): Promise<T | undefined> {
	if (!cfg) {
		return;
	}

	const [modulePath, ...params] = cfg;
	const mod = await loadModule<T>(modulePath);

	const providerOrErr = await mod(...params);

	if (providerOrErr.isLeft()) {
		console.error("could not load provider");
		console.error(providerOrErr.value);
		Deno.exit(-1);
	}

	return providerOrErr.value;
}

async function loadModule<T>(
	modulePath: string,
): Promise<(...p: string[]) => Promise<Either<AntboxError, T>>> {
	const path = modulePath.startsWith("/") ? modulePath : `./src/adapters/${modulePath}`;

	try {
		const m = await import(path);
		return m.default;
	} catch (e) {
		console.error("could not load module");
		console.error(e);
		Deno.exit(-1);
	}
}
