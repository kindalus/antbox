import { startServer } from "mod.ts";

// Start the server with the tenants
startServer({
  tenants: [{ name: "tenant_a" }, { name: "tenant_b" }],
});
