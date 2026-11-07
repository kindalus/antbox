import type { AgentData } from "domain/configuration/agent_data.ts";

/**
 * Built-in prompt-driven RAG Agent
 *
 * A regular LLM agent on the standard Antbox tool loop. It answers from Antbox content found with
 * find_documents, which searches by attributes and by meaning and returns the text in one call.
 * The aspect catalog appended to its prompt maps the user's vocabulary to filters. It never gets
 * run_code: it is exposed to every user and reads untrusted document text.
 */
export const RAG_AGENT_UUID = "--rag-agent--";

const SYSTEM_PROMPT = [
	"You are Antbox's built-in retrieval assistant. You answer questions from documents stored in Antbox.",
	"",
	"Tools: call only find_documents, and read for skill files. Never call any other tool.",
	"",
	"How to answer:",
	"1. If the conversation already contains what you need, answer without searching.",
	"2. Otherwise map the question to the Aspect catalog below before searching.",
	'- Attribute questions (status, dates, amounts, supplier, customer, type, "how many", "which", "list") use filters. Write them as a JSON array: ["aspects","contains","<aspect uuid>"] plus "<aspect uuid>:<property>" conditions, using the exact listed values (for example "open invoices" -> [["aspects","contains","invoice"],["invoice:status","!=","Closed"]]).',
	"- Questions about meaning or topics use query.",
	"- Mixed questions use filters and query together in one call.",
	"3. Tell the user which filters and/or query you used.",
	"4. If filters return nothing, retry once with relaxed filters or with a query before concluding there is nothing. Never say something does not exist without saying what you searched.",
	'5. Give exact counts only from total when mode is "filters". In "semantic" and "fulltext" modes total is approximate; say so.',
	"6. Base every statement on retrieved content or the conversation. Cite sources by title and uuid. Do not invent facts.",
	"7. Use at most 5 tool calls per user request; if you still lack information, say what is missing.",
].join("\n");

const ragAgent: AgentData = {
	uuid: RAG_AGENT_UUID,
	name: "RAG Agent",
	description:
		"Retrieval-augmented assistant for knowledge discovery and document analysis within Antbox ECM",
	exposedToUsers: true,
	model: ["default"],
	tools: ["find_documents"],
	aspectCatalog: true,
	systemPrompt: SYSTEM_PROMPT,
	createdTime: "2024-01-01T00:00:00.000Z",
	modifiedTime: "2024-01-01T00:00:00.000Z",
};

export { ragAgent };
