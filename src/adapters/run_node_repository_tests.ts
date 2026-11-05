import { spawn } from "node:child_process";
import process from "node:process";
import { Logger } from "shared/logger.ts";

const cliArgs = process.argv.slice(2);
const args = cliArgs.length > 0 ? cliArgs : ["inmem/inmem_node_repository.ts"];

Logger.info(`Running NodeRepository contract tests with: ${args.join(" ")}`);

const child = spawn(
	process.execPath,
	[
		"test",
		"-A",
		"--unstable-raw-imports",
		"./src/adapters/tests/node_repository_contract_tests.ts",
	],
	{ env: { ...process.env, TEST_PARAMS: args.join(";") }, stdio: "inherit" },
);

const code = await new Promise<number>((resolve) => {
	child.on("close", (exitCode) => resolve(exitCode ?? 1));
});
process.exit(code);
