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

export default function (tenants: AntboxTenant[]): Router {
	const router = new Router({ prefix: "/agents" });

	// CRUD operations
	router.post("/", adapt(createOrReplaceAgentHandler(tenants)));
	router.get("/", adapt(listAgentsHandler(tenants)));
	router.get("/:uuid", adapt(getAgentHandler(tenants)));
	router.delete("/:uuid", adapt(deleteAgentHandler(tenants)));

	// Execution operations
	router.post("/:uuid/-/chat", adapt(chatHandler(tenants)));
	router.post("/:uuid/-/answer", adapt(answerHandler(tenants)));

	// RAG operations
	router.post("/rag/-/chat", adapt(ragChatHandler(tenants)));

	return router;
}
