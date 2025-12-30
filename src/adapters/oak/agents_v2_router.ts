import { Router } from "@oak/oak";
import type { AntboxTenant } from "api/antbox_tenant.ts";
import {
	answerHandler,
	chatHandler,
	createOrReplaceAgentHandler,
	deleteAgentHandler,
	getAgentHandler,
	listAgentsHandler,
	ragChatHandler,
} from "api/agents_handlers.ts";
import { adapt } from "./adapt.ts";

/**
 * Builds the agents router for the Oak HTTP adapter.
 *
 * @remarks
 * External setup:
 * - Pass the configured tenant list (e.g., from `setupTenants`).
 * - Run Deno with `--allow-net` when serving HTTP.
 *
 * @example
 * const router = agentsRouter(tenants);
 * app.use(router.routes(), router.allowedMethods());
 */
export default function (tenants: AntboxTenant[]): Router {
	const router = new Router({ prefix: "/agents" });

	// CRUD operations
	router.post("/-/upload", adapt(createOrReplaceAgentHandler(tenants)));
	router.get("/", adapt(listAgentsHandler(tenants)));
	router.get("/:uuid", adapt(getAgentHandler(tenants)));
	router.delete("/:uuid", adapt(deleteAgentHandler(tenants)));

	// RAG operations
	router.post("/rag/-/chat", adapt(ragChatHandler(tenants)));

	// Execution operations
	router.post("/:uuid/-/chat", adapt(chatHandler(tenants)));
	router.post("/:uuid/-/answer", adapt(answerHandler(tenants)));

	return router;
}
