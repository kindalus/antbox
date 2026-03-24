import {
	createEvent,
	type Event,
	InMemoryRunner,
	type InvocationContext,
	isFinalResponse,
	LlmAgent,
	type RunConfig,
} from "@google/adk";
import type { AgentData } from "domain/configuration/agent_data.ts";
import type { NodeLike } from "domain/node_like.ts";
import {
	BaseAntboxAgent,
	type BaseAntboxAgentConfig,
} from "application/ai/custom_agents/base_antbox_agent.ts";

/**
 * Built-in RAG (Retrieval-Augmented Generation) Agent
 *
 * A custom orchestrated pipeline:
 * 1. Query the content repository using semantic and full-text strategies
 * 2. Infer fallback keywords only when semantic search returns no results
 * 3. Synthesize a cited answer from the retrieved results
 */
export const RAG_AGENT_UUID = "--rag-agent--";

const INLINE_KEYWORD_AGENT_NAME = "rag_inline_keyword_fallback";
const INLINE_SUMMARIZER_AGENT_NAME = "rag_inline_summarizer";
const INLINE_APP_NAME = "antbox-rag-inline";
const INLINE_MAX_LLM_CALLS = 10;

const KEYWORD_LIMIT = 5;
const MAX_RESULT_ITEMS = 10;

const KEYWORD_AGENT_SYSTEM_PROMPT = `You infer fallback search keywords for Antbox full-text search.

Rules:
- Read the user query and infer the strongest 1 to 5 search keywords or short phrases.
- Return only a JSON array of strings.
- Do not return more than 5 items.
- Do not include explanations, markdown, or any text outside the JSON array.

Example output:
["vacation policy", "carry over", "days"]
`;

const RAG_SUMMARIZER_SYSTEM_PROMPT = `You are a knowledge synthesis specialist.

Goal: compose a well-cited, natural-language answer to the user's question using only the provided search results.

Input format:
- A section labeled "User query:" followed by the original request.
- A section labeled "Search results:" followed by one of these:
  - raw retrieved content text from semantic search
  - a JSON array string of node metadata from fallback full-text search
  - an empty string when no relevant results were found

Answer guidelines:
1. Ground every claim in the provided search results.
2. Cite sources by document names and UUIDs.
3. Synthesize information from multiple documents when relevant.
4. If the results do not contain enough information, say so clearly.
5. Reply in the same language the user used.

Citation format:
- Inline: According to *Document Title* (uuid: document-uuid), ...
- End: Sources: *Title 1* (uuid-1), *Title 2* (uuid-2)

If the search results array is empty or irrelevant, clearly say that no relevant documents were found.
`;

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

type UsageMetadata = {
	promptTokenCount?: number;
	candidatesTokenCount?: number;
	totalTokenCount?: number;
};

type StageRunner = (
	stage: "keywords" | "summarize",
	input: string,
	userId: string,
) => Promise<{ text: string; usageMetadata?: UsageMetadata }>;

type SearchPayload = {
	text: string;
	usageMetadata?: UsageMetadata;
};

const ragAgent: AgentData = {
	uuid: RAG_AGENT_UUID,
	name: "RAG Agent",
	description:
		"Retrieval-Augmented Generation agent for knowledge discovery and document analysis within Antbox ECM",
	type: "sequential",
	exposedToUsers: true,
	agents: [INLINE_KEYWORD_AGENT_NAME, INLINE_SUMMARIZER_AGENT_NAME],
	createdTime: "2024-01-01T00:00:00.000Z",
	modifiedTime: "2024-01-01T00:00:00.000Z",
};

export interface RagAgentConfig extends Omit<BaseAntboxAgentConfig, "name" | "description"> {
	readonly defaultModel: string;
	readonly additionalInstructions?: string;
	readonly stageRunner?: StageRunner;
}

export class RagAgent extends BaseAntboxAgent {
	readonly #keywordAgent: LlmAgent;
	readonly #summarizerAgent: LlmAgent;
	readonly #stageRunner: StageRunner;

	constructor(config: RagAgentConfig) {
		super({
			...config,
			name: "rag_agent",
			description: ragAgent.description,
		});

		this.#keywordAgent = new LlmAgent({
			name: INLINE_KEYWORD_AGENT_NAME,
			description: "Infers fallback full-text keywords when semantic search returns no hits",
			instruction: KEYWORD_AGENT_SYSTEM_PROMPT,
			model: config.defaultModel,
			tools: [],
		});

		this.#summarizerAgent = new LlmAgent({
			name: INLINE_SUMMARIZER_AGENT_NAME,
			description: "Synthesizes grounded answers from filtered RAG search results",
			instruction: this.#buildSummarizerInstruction(config.additionalInstructions),
			model: config.defaultModel,
			tools: [],
		});

		this.#stageRunner = config.stageRunner ??
			((stage, input, userId) => this.#runInlineAgent(stage, input, userId));
	}

	async *runLiveImpl(ctx: InvocationContext): AsyncGenerator<Event, void, undefined> {
		yield* this.runAsyncImpl(ctx);
	}

	async *runAsyncImpl(
		context: InvocationContext,
	): AsyncGenerator<Event, void, undefined> {
		const query = this.#extractQuery(context);
		const searchResult = await this.#search(query, context.userId);

		const summarizeResult = await this.#stageRunner(
			"summarize",
			this.#buildStageInput(query, searchResult.text),
			context.userId,
		);

		yield createEvent({
			invocationId: context.invocationId,
			author: this.name,
			branch: context.branch,
			content: {
				role: "model",
				parts: [{ text: summarizeResult.text }],
			},
			usageMetadata: this.#mergeUsage(searchResult.usageMetadata, summarizeResult.usageMetadata),
		});
	}

	#buildSummarizerInstruction(additionalInstructions?: string): string {
		if (!additionalInstructions) {
			return RAG_SUMMARIZER_SYSTEM_PROMPT;
		}

		return `${RAG_SUMMARIZER_SYSTEM_PROMPT}\n\n## Additional Instructions\n\n${additionalInstructions}`;
	}

	#extractQuery(context: InvocationContext): string {
		const parts = context.userContent?.parts ?? [];
		return parts.map((part) => part.text ?? "").join(" ").trim();
	}

	async #search(query: string, userId: string): Promise<SearchPayload> {
		if (!query) {
			return { text: "" };
		}

		const semanticRes = await this.sdk.nodes.semanticQuery(query);
		if (semanticRes.isRight()) {
			const semanticHits = semanticRes.value as SemanticHit[];
			if (semanticHits.length > 0) {
				return {
					text: semanticHits
						.slice(0, MAX_RESULT_ITEMS)
						.map((doc) => doc.content ?? "")
						.filter((content) => content.length > 0)
						.join("\n---\n"),
				};
			}
		}

		const keywordResult = await this.#stageRunner(
			"keywords",
			this.#buildKeywordStageInput(query),
			userId,
		);
		const fallbackKeywords = this.#parseKeywords(keywordResult.text);
		if (fallbackKeywords.length === 0) {
			return { text: "", usageMetadata: keywordResult.usageMetadata };
		}

		const findResults = await Promise.all(
			fallbackKeywords.map((keyword) => this.sdk.nodes.find([["fulltext", "match", keyword]])),
		);
		const mergedNodes = this.#mergeFallbackNodes(findResults);
		if (mergedNodes.length === 0) {
			return { text: "", usageMetadata: keywordResult.usageMetadata };
		}

		const foundNodes = mergedNodes.slice(0, MAX_RESULT_ITEMS);
		const parentMap = await this.#loadParentTitles(foundNodes);
		return {
			text: JSON.stringify(foundNodes.map((node) => ({
				uuid: node.uuid,
				name: node.title,
				snippet: (node.description ?? "").slice(0, 300),
				parent: node.parent ?? "",
				parentTitle: node.parent ? (parentMap.get(node.parent) ?? "") : "",
			}))),
			usageMetadata: keywordResult.usageMetadata,
		};
	}

	#buildKeywordStageInput(query: string): string {
		return `User query:\n${query}`;
	}

	#parseKeywords(text: string): string[] {
		try {
			const parsed = JSON.parse(text);
			if (!Array.isArray(parsed)) {
				return [];
			}

			return parsed
				.filter((value): value is string => typeof value === "string")
				.map((keyword) => keyword.trim())
				.filter((keyword) => keyword.length > 0)
				.slice(0, KEYWORD_LIMIT);
		} catch {
			return [];
		}
	}

	#mergeFallbackNodes(
		findResults: Array<Awaited<ReturnType<typeof this.sdk.nodes.find>>>,
	): NodeLike[] {
		const nodesByUuid = new Map<string, NodeLike>();
		for (const result of findResults) {
			if (result.isLeft()) {
				continue;
			}

			for (const node of result.value.nodes) {
				if (!nodesByUuid.has(node.uuid)) {
					nodesByUuid.set(node.uuid, node);
				}
			}
		}

		return [...nodesByUuid.values()];
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

	#buildStageInput(query: string, searchResultsJson: string): string {
		return `User query:\n${query}\n\nSearch results:\n${searchResultsJson}`;
	}

	async #runInlineAgent(
		stage: "keywords" | "summarize",
		input: string,
		userId: string,
	): Promise<{ text: string; usageMetadata?: UsageMetadata }> {
		const agent = stage === "keywords" ? this.#keywordAgent : this.#summarizerAgent;
		const runner = new InMemoryRunner({ agent, appName: INLINE_APP_NAME });
		const runConfig: RunConfig = { maxLlmCalls: INLINE_MAX_LLM_CALLS };

		let text = "";
		let usageMetadata: UsageMetadata | undefined;
		for await (
			const event of runner.runEphemeral({
				userId,
				newMessage: { role: "user", parts: [{ text: input }] },
				runConfig,
			})
		) {
			if (isFinalResponse(event) && event.content?.parts) {
				text = event.content.parts.map((part: { text?: string }) => part.text ?? "").join("");
				usageMetadata = event.usageMetadata as UsageMetadata | undefined;
				break;
			}
		}

		return { text, usageMetadata };
	}

	#mergeUsage(...usageMetadatas: Array<UsageMetadata | undefined>): UsageMetadata | undefined {
		const merged = usageMetadatas.reduce<UsageMetadata>((acc, usage) => ({
			promptTokenCount: (acc.promptTokenCount ?? 0) + (usage?.promptTokenCount ?? 0),
			candidatesTokenCount: (acc.candidatesTokenCount ?? 0) +
				(usage?.candidatesTokenCount ?? 0),
			totalTokenCount: (acc.totalTokenCount ?? 0) + (usage?.totalTokenCount ?? 0),
		}), {});

		return merged.totalTokenCount ? merged : undefined;
	}
}

export { ragAgent };
