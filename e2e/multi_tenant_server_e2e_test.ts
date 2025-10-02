import startServer from "../server.ts";
// Start the server with the tenants
startServer({
	tenants: [
		{
			name: "tenant_a",
			storage: ["inmem/inmem_storage_provider.ts", ""],
			repository: ["inmem/inmem_node_repository.ts", ""],
		},
		{
			name: "tenant_b",
			storage: ["inmem/inmem_storage_provider.ts", ""],
			repository: ["inmem/inmem_node_repository.ts", ""],
		},
	],
});
