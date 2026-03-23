import { createEvent, type InvocationContext } from "@google/adk";
import type { AgentData } from "domain/configuration/agent_data.ts";
import type { NodeLike } from "domain/node_like.ts";
import { BaseAntboxAgent, type BaseAntboxAgentConfig } from "./base_antbox_agent.ts";

export const SEMANTIC_SEARCHER_AGENT_UUID = "--semantic-searcher-agent--";

const SEMANTIC_SEARCHER_SYSTEM_PROMPT =
	`You are a semantic search specialist for the Antbox ECM platform.

## Goal

Your goal is to find nodes matching the user's query and return a JSON array that the next pipeline agent can consume.

## Tools

- **runCode** — Executes JavaScript code against the Antbox node repository API. Use it to perform semantic and full-text searches. You must always use the strict template below; never write freeform code.
- **skillLoader** — Loads API reference documentation by skill name. Use it ONLY if \`runCode\` fails due to an API change, so you can learn the current API surface and write a corrected call.

## Procedure

You have exactly 2 moves. No more.

### Move 1 — Single runCode call (strict template)

Copy the template below VERBATIM into a runCode call. Replace ONLY the two placeholders marked with angle-quote characters (« »):

- «USER_QUERY» → the user's original query text
- «FALLBACK_KEYWORDS» → 3–6 insightful keywords YOU extract from the query, space-separated

Do NOT modify anything else in the template. Do NOT write your own code.

\`\`\`javascript
export default async function({ nodes }) {
  // --- Primary: semantic search ---
  const semRes = await nodes.semanticQuery("«USER_QUERY»");
  if (!semRes.isLeft() && semRes.value.length > 0) {
    const items = semRes.value.slice(0, 10).map((doc) => ({
      uuid: doc.uuid,
      name: doc.title,
      snippet: (doc.content || "").slice(0, 300),
      parent: "",
      parentTitle: "",
    }));
    return JSON.stringify(items);
  }

  // --- Fallback: full-text keyword search ---
  const findRes = await nodes.find([["fulltext", "match", "«FALLBACK_KEYWORDS»"]]);
  if (findRes.isLeft()) return JSON.stringify([]);

  const foundNodes = findRes.value.nodes.slice(0, 10);
  const parentUuids = [...new Set(foundNodes.map((n) => n.parent).filter(Boolean))];
  const parentMap = {};
  if (parentUuids.length > 0) {
    const pRes = await nodes.find([["uuid", "in", parentUuids]]);
    if (!pRes.isLeft()) {
      for (const p of pRes.value.nodes) parentMap[p.uuid] = p.title;
    }
  }

  const items = foundNodes.map((node) => ({
    uuid: node.uuid,
    name: node.title,
    snippet: (node.description || "").slice(0, 300),
    parent: node.parent || "",
    parentTitle: parentMap[node.parent] || "",
  }));
  return JSON.stringify(items);
}
\`\`\`

### Move 2 — Output or recover

**If runCode succeeded:** output its return value AS-IS. No markdown fences, no explanation, no extra text. The next agent in the pipeline consumes this raw JSON.

**If runCode failed** (runtime error, method not found, API change, etc.):
1. Call \`skillLoader("node-querying")\` to load the current API reference.
2. Using the learned API, write a NEW runCode call that performs the same semantic-then-fulltext search. The output shape MUST still be a JSON array of objects with fields: \`uuid\`, \`name\`, \`snippet\`, \`parent\`, \`parentTitle\`.
3. After the new runCode returns, output its return value AS-IS.

## Expected Output

Your final output must be a raw JSON array (no wrapping, no markdown fences). Example:

\`\`\`
[{"uuid":"a1b2c3","name":"Vacation Policy 2025","snippet":"All employees are entitled to 22 days...","parent":"f0e1d2","parentTitle":"HR Policies"},{"uuid":"d4e5f6","name":"Remote Work Guidelines","snippet":"Teams may work remotely up to 3 days per week...","parent":"f0e1d2","parentTitle":"HR Policies"}]
\`\`\`

## Anti-patterns (DO NOT do any of these)

- Do NOT rename fields. The output MUST use: uuid, name, snippet, parent, parentTitle.
- Do NOT return raw API shapes like { title, score } or { title, content }.
- Do NOT write your own code. Copy the template above and only replace the «» placeholders.
- Do NOT wrap the final output in markdown code fences or add commentary.
`;

export const SEMANTIC_SEARCHER_AGENT: AgentData = {
	uuid: SEMANTIC_SEARCHER_AGENT_UUID,
	name: "Semantic Searcher",
	description: "Searches the Antbox node repository using semantic and full-text strategies",
	type: "llm",
	exposedToUsers: false,
	model: "default",
	tools: ["runCode", "skillLoader"],
	systemPrompt: SEMANTIC_SEARCHER_SYSTEM_PROMPT,
	maxLlmCalls: 10,
	createdTime: "2024-01-01T00:00:00.000Z",
	modifiedTime: "2024-01-01T00:00:00.000Z",
};

type SemanticHit = {
	uuid: string;
	title?: string;
	content?: string;
};

type SearchResultItem = {
	uuid: string;
	name: string;
	snippet: string;
	parent: string;
	parentTitle: string;
};

const STOPWORDS = new Set([
	"a",
	"an",
	"and",
	"are",
	"as",
	"at",
	"be",
	"by",
	"for",
	"from",
	"how",
	"i",
	"in",
	"is",
	"it",
	"of",
	"on",
	"or",
	"that",
	"the",
	"this",
	"to",
	"what",
	"where",
	"which",
	"who",
	"why",
	"with",
]);

export class SemanticSearcherCustomAgent extends BaseAntboxAgent {
	constructor(config: Omit<BaseAntboxAgentConfig, "name" | "description">) {
		super({
			...config,
			name: "semantic_searcher",
			description: SEMANTIC_SEARCHER_AGENT.description,
		});
	}

	protected async *runAsyncImpl(
		context: InvocationContext,
	): AsyncGenerator<import("@google/adk").Event, void, void> {
		const query = this.#extractQuery(context);
		const json = await this.#search(query);

		yield createEvent({
			invocationId: context.invocationId,
			author: this.name,
			branch: context.branch,
			content: {
				role: "model",
				parts: [{ text: json }],
			},
		});
	}

	#extractQuery(context: InvocationContext): string {
		const parts = context.userContent?.parts ?? [];
		return parts
			.map((part) => part.text ?? "")
			.join(" ")
			.trim();
	}

	async #search(query: string): Promise<string> {
		if (!query) {
			return JSON.stringify([]);
		}

		const semanticRes = await this.sdk.nodes.semanticQuery(query);
		if (semanticRes.isRight()) {
			const semanticHits = semanticRes.value as SemanticHit[];
			if (semanticHits.length > 0) {
				const items = semanticHits.slice(0, 10).map((doc) => ({
					uuid: doc.uuid,
					name: doc.title ?? "",
					snippet: (doc.content ?? "").slice(0, 300),
					parent: "",
					parentTitle: "",
				}));

				return JSON.stringify(items);
			}
		}

		const fallbackKeywords = this.#buildFallbackKeywords(query);
		const findRes = await this.sdk.nodes.find([["fulltext", "match", fallbackKeywords]]);
		if (findRes.isLeft()) {
			return JSON.stringify([]);
		}

		const foundNodes = findRes.value.nodes.slice(0, 10);
		const parentMap = await this.#loadParentTitles(foundNodes);
		const items: SearchResultItem[] = foundNodes.map((node) => ({
			uuid: node.uuid,
			name: node.title,
			snippet: (node.description ?? "").slice(0, 300),
			parent: node.parent ?? "",
			parentTitle: node.parent ? (parentMap.get(node.parent) ?? "") : "",
		}));

		return JSON.stringify(items);
	}

	#buildFallbackKeywords(query: string): string {
		const filtered = [
			...new Set(
				query
					.toLowerCase()
					.match(/[a-z0-9]+/gim)?.filter((token) =>
						token.length > 2 && !STOPWORDS.has(token)
					) ?? [],
			),
		];

		const keywords = filtered.length > 0
			? filtered.slice(0, 6)
			: (query.match(/[a-z0-9]+/gim) ?? []).slice(0, 6);

		return keywords.join(" ").trim() || query;
	}

	async #loadParentTitles(nodes: NodeLike[]): Promise<Map<string, string>> {
		const parentUuids = [...new Set(nodes.map((node) => node.parent).filter(Boolean))];
		if (parentUuids.length === 0) {
			return new Map();
		}

		const parentRes = await this.sdk.nodes.find([["uuid", "in", parentUuids]]);
		if (parentRes.isLeft()) {
			return new Map();
		}

		return new Map(parentRes.value.nodes.map((node) => [node.uuid, node.title]));
	}
}
