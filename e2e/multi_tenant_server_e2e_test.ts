import startServer from "../server.ts";
// Start the server with the tenants
startServer({
  tenants: [{ name: "tenant_a" }, { name: "tenant_b" }],
});
