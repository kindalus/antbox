import { startServer } from "../mod.ts";

// Start the server with the tenants
startServer({
	tentants: [
		{ name: "tenant_a" },
		{ name: "tenant_b" },
	],
});
