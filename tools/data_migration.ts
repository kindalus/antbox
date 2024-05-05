import { providerFrom } from "../mod.ts";
import { Node } from "../src/domain/nodes/node.ts";
import { NodeRepository } from "../src/domain/nodes/node_repository.ts";
import { StorageProvider } from "../src/domain/providers/storage_provider.ts";

const NON_FILES = [
	Node.API_KEY_MIMETYPE,
	Node.ASPECT_MIMETYPE,
	Node.FOLDER_MIMETYPE,
	Node.FORM_SPECIFICATION_MIMETYPE,
	Node.GROUP_MIMETYPE,
	Node.META_NODE_MIMETYPE,
	Node.SMART_FOLDER_MIMETYPE,
	Node.USER_MIMETYPE,
];

interface ServiceConfig {
	readonly repository: [string, ...string[]];
	readonly storage: [string, ...string[]];
}

interface MigrationConfig {
	readonly src: ServiceConfig;
	readonly dst: ServiceConfig;
}

function assert<T>(provider: T | undefined, message: string): asserts provider is T {
	if (!provider) {
		throw new Error(message);
	}
}

async function main() {
	if (Deno.args.length === 0) {
		console.error(
			"Usage: deno run --allow-read --allow-write tools/data_migration.ts <path/to/config.json>",
		);

		console.log(`
        Config file should look like this:
        {
            "src": {
                "repository": ["<provider>", "<arg1>", "<arg2>", ...],
                "storage": ["<provider>", "<arg1>", "<arg2>", ...]
            },
            "dst": {
                "repository": ["<provider>", "<arg1>", "<arg2>", ...],
                "storage": ["<provider>", "<arg1>", "<arg2>", ...]
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

	await migrateChildren(srcRepo, dstRepo, srcStorage, dstStorage);
	await migrateChildren(srcRepo, dstRepo, srcStorage, dstStorage, Node.ACTIONS_FOLDER_UUID);
	await migrateChildren(srcRepo, dstRepo, srcStorage, dstStorage, Node.API_KEYS_FOLDER_UUID);
	await migrateChildren(srcRepo, dstRepo, srcStorage, dstStorage, Node.ASPECTS_FOLDER_UUID);
	await migrateChildren(srcRepo, dstRepo, srcStorage, dstStorage, Node.EXT_FOLDER_UUID);
	await migrateChildren(
		srcRepo,
		dstRepo,
		srcStorage,
		dstStorage,
		Node.FORMS_SPECIFICATIONS_FOLDER_UUID,
	);
	await migrateChildren(srcRepo, dstRepo, srcStorage, dstStorage, Node.GROUPS_FOLDER_UUID);
	await migrateChildren(srcRepo, dstRepo, srcStorage, dstStorage, Node.USERS_FOLDER_UUID);
}

async function migrateChildren(
	srcRepo: NodeRepository,
	dstRepo: NodeRepository,
	srcStorage: StorageProvider,
	dstStorage: StorageProvider,
	uuid = Node.ROOT_FOLDER_UUID,
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
			console.log(`Failed to migrate node uuid: ${node.uuid} / metadata: ${node.title}`);
			console.error(voidOrErr.value.message);
			Deno.exit(1);
		}

		console.log(`Migrated node metadata: ${node.title}`);

		if (node.isFolder()) {
			await migrateChildren(srcRepo, dstRepo, srcStorage, dstStorage, node.uuid);
			continue;
		}

		migrateNode(srcStorage, dstStorage, node);
	}
}

async function migrateNode(
	srcStorage: StorageProvider,
	dstStorage: StorageProvider,
	node: Node,
): Promise<void> {
	if (NON_FILES.includes(node.mimetype)) {
		return;
	}

	const fileOrErr = await srcStorage.read(node.uuid);
	if (fileOrErr.isLeft()) {
		console.error(fileOrErr.value.message);
		console.log(`Failed to read file node node uuid: ${node.uuid} / metadata: ${node.title}`);
		Deno.exit(1);
	}

	const voidOrErr = await dstStorage.write(node.uuid, fileOrErr.value, {
		parent: node.parent,
		title: node.title,
		mimetype: node.mimetype,
	});

	if (voidOrErr.isLeft()) {
		console.error(voidOrErr.value.message);
		console.log(`Failed to write file node uuid: ${node.uuid} / metadata: ${node.title}`);
		Deno.exit(1);
	}

	console.log(`Migrated file node ${node.title}`);
}

if (import.meta.main) {
	await main();
}
