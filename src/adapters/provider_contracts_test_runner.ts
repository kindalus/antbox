if (Deno.args.length < 2) {
  console.error("This script must be run with command line arguments.");
  console.error(
    "usage: deno run -A provider_contracts_test_runner.ts <storage|repository> <provider_url>*",
  );
  Deno.exit(1);
}

const testCasePath = Deno.args[0] === "storage"
  ? "./src/adapters/storage_provider_contract_tests.ts"
  : "./src/adapters/node_repository_contract_tests.ts";

const cmd = new Deno.Command(Deno.env.get("_")!, {
  args: [
    "test",
    "-A",
    // "--inspect-wait",
    testCasePath,
  ],
  env: {
    TEST_PARAMS: Deno.args.slice(1).join(";"),
  },
});

cmd.outputSync();
