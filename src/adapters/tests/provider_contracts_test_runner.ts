import { spawnSync } from "node:child_process";
import process from "node:process";
import { Logger } from "shared/logger.ts";

const cliArgs = process.argv.slice(2);

if (cliArgs.length < 2) {
	Logger.error("This script must be run with command line arguments.");
	Logger.error(
		"usage: bun provider_contracts_test_runner.ts <storage|repository> <provider_url>*",
	);
	process.exit(1);
}

const testCasePath = cliArgs[0] === "storage"
	? "./src/adapters/storage_provider_contract_tests.ts"
	: "./src/adapters/node_repository_contract_tests.ts";

spawnSync(
	process.env._ ?? process.execPath,
	[
		"--no-env-file",
		"test",
		"--timeout",
		"30000",
		testCasePath,
	],
	{ env: { TEST_PARAMS: cliArgs.slice(1).join(";") } },
);
