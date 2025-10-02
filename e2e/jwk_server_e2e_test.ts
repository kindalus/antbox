import startServer from "../server.ts";
// Start the server with the tenants
startServer({
	tenants: [
		{
			name: "test_tentant",
			jwkPath: "./jwk.json",
			storage: [
				"flat_file/flat_file_storage_provider.ts",
				"/tmp/antbox/storage",
			],
			repository: [
				"flat_file/flat_file_node_repository.ts",
				"/tmp/antbox/repository",
			],
		},
	],
});
