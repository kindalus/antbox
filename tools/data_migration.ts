import { providerFrom } from "adapters/module_configuration_parser.ts";
import type { StorageProvider } from "application/nodes/storage_provider.ts";
import type {
	CollectionMap,
	ConfigurationRepository,
} from "domain/configuration/configuration_repository.ts";
import type { NodeLike } from "domain/node_like.ts";
import type { NodeRepository } from "domain/nodes/node_repository.ts";
import { Nodes } from "domain/nodes/nodes.ts";

interface ServiceConfig {
	readonly repository: [string, ...string[]];
	readonly storage: [string, ...string[]];
	readonly configuration?: [string, ...string[]];
}

interface MigrationConfig {
	readonly src: ServiceConfig;
	readonly dst: ServiceConfig;
}

function assert<T>(
	provider: T | undefined,
	message: string,
): asserts provider is T {
	if (!provider) {
		throw new Error(message);
	}
}

async function main() {
	if (Deno.args.length === 0) {
		console.error(
			"Usage: deno run --allow-read --allow-write --allow-ffi tools/data_migration.ts <path/to/config.json>",
		);

		console.log(`
        Config file should look like this:
        {
            "src": {
                "repository": ["<provider>", "<arg1>", "<arg2>", ...],
                "storage": ["<provider>", "<arg1>", "<arg2>", ...],
                "configuration": ["<provider>", "<arg1>", "<arg2>", ...]
            },
            "dst": {
                "repository": ["<provider>", "<arg1>", "<arg2>", ...],
                "storage": ["<provider>", "<arg1>", "<arg2>", ...],
                "configuration": ["<provider>", "<arg1>", "<arg2>", ...]
            }
        }`);

		Deno.exit(1);
	}

	const path = Deno.args[0];
	const { default: cfg }: { default: MigrationConfig } = await import(path, {
		with: { type: "json" },
	});

	console.log("Migrating data using configuration:");
	console.log(JSON.stringify(cfg, null, 2));

	const srcRepo = await providerFrom<NodeRepository>(cfg.src.repository);
	const dstRepo = await providerFrom<NodeRepository>(cfg.dst.repository);

	const srcStorage = await providerFrom<StorageProvider>(cfg.src.storage);
	const dstStorage = await providerFrom<StorageProvider>(cfg.dst.storage);

	assert(srcRepo, "Invalid source repository configuration");
	assert(dstRepo, "Invalid destination repository configuration");
	assert(srcStorage, "Invalid source storage configuration");
	assert(dstStorage, "Invalid destination storage configuration");

	// Migrate nodes (content)
	console.log("\n=== Migrating nodes ===");
	await migrateChildren(srcRepo, dstRepo, srcStorage, dstStorage);

	// Migrate configuration data if configuration repositories are provided
	if (cfg.src.configuration && cfg.dst.configuration) {
		const srcConfig = await providerFrom<ConfigurationRepository>(cfg.src.configuration);
		const dstConfig = await providerFrom<ConfigurationRepository>(cfg.dst.configuration);

		assert(srcConfig, "Invalid source configuration repository");
		assert(dstConfig, "Invalid destination configuration repository");

		console.log("\n=== Migrating configuration ===");
		await migrateConfiguration(srcConfig, dstConfig);
	}

	console.log("\n=== Migration complete ===");
}

async function migrateConfiguration(
	srcConfig: ConfigurationRepository,
	dstConfig: ConfigurationRepository,
): Promise<void> {
	const collections: (keyof CollectionMap)[] = [
		"groups",
		"users",
		"apikeys",
		"aspects",
		"workflows",
		"workflowInstances",
		"agents",
		"features",
	];

	for (const collection of collections) {
		console.log(`Migrating ${collection}...`);

		const itemsOrErr = await srcConfig.list(collection);
		if (itemsOrErr.isLeft()) {
			console.error(`Failed to list ${collection}: ${itemsOrErr.value.message}`);
			continue;
		}

		const items = itemsOrErr.value;
		console.log(`Found ${items.length} items in ${collection}`);

		for (const item of items) {
			const saveOrErr = await dstConfig.save(collection, item);
			if (saveOrErr.isLeft()) {
				console.error(`Failed to save ${collection} item: ${saveOrErr.value.message}`);
				Deno.exit(1);
			}
		}

		console.log(`Migrated ${items.length} ${collection}`);
	}
}

async function migrateChildren(
	srcRepo: NodeRepository,
	dstRepo: NodeRepository,
	srcStorage: StorageProvider,
	dstStorage: StorageProvider,
	uuid = Nodes.ROOT_FOLDER_UUID,
): Promise<void> {
	const children = await srcRepo?.filter(
		[["parent", "==", uuid]],
		Number.MAX_SAFE_INTEGER,
		1,
	);

	console.log(`Migrating children of ${uuid}`);
	console.log(`Number of children: ${children?.nodes.length}`);

	for (const node of children?.nodes ?? []) {
		const voidOrErr = await dstRepo.add(node);
		if (voidOrErr.isLeft()) {
			console.log(
				`Failed to migrate node uuid: ${node.uuid} / metadata: ${node.title}`,
			);
			console.error(voidOrErr.value.message);
			Deno.exit(1);
		}

		console.log(`Migrated node metadata: ${node.title}`);

		if (Nodes.isFolder(node)) {
			await migrateChildren(
				srcRepo,
				dstRepo,
				srcStorage,
				dstStorage,
				node.uuid,
			);
			continue;
		}

		await migrateNode(srcStorage, dstStorage, node);
	}
}

async function migrateNode(
	srcStorage: StorageProvider,
	dstStorage: StorageProvider,
	node: NodeLike,
): Promise<void> {
	// Skip non-file nodes (folders, smart folders, meta nodes, articles)
	if (!Nodes.isFileLike(node)) {
		return;
	}

	const fileOrErr = await srcStorage.read(node.uuid);
	if (fileOrErr.isLeft()) {
		console.error(fileOrErr.value.message);
		console.log(
			`Failed to read file node uuid: ${node.uuid} / metadata: ${node.title}`,
		);
		Deno.exit(1);
	}

	const voidOrErr = await dstStorage.write(node.uuid, fileOrErr.value, {
		parent: node.parent,
		title: node.title,
		mimetype: node.mimetype,
	});

	if (voidOrErr.isLeft()) {
		console.error(voidOrErr.value.message);
		console.log(
			`Failed to write file node uuid: ${node.uuid} / metadata: ${node.title}`,
		);
		Deno.exit(1);
	}

	console.log(`Migrated file node ${node.title}`);
}

if (import.meta.main) {
	await main();
}
