import { Logger } from "shared/logger.ts";

const args = Deno.args.length > 0 ? Deno.args : ["inmem/inmem_node_repository.ts"];

Logger.info(`Running NodeRepository contract tests with: ${args.join(" ")}`);

const cmd = new Deno.Command(Deno.execPath(), {
	args: [
		"test",
		"-A",
		"--unstable-raw-imports",
		"./src/adapters/tests/node_repository_contract_tests.ts",
	],
	env: {
		...Deno.env.toObject(),
		TEST_PARAMS: args.join(";"),
	},
	stdout: "inherit",
	stderr: "inherit",
});

const { code } = await cmd.output();
Deno.exit(code);
