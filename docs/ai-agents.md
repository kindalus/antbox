---
name: ai-agents
description: Guide to AI agents in Antbox
---

# AI Agents

Agents are tenant-scoped configuration records executed through Pi `AgentSession` and
`ModelRuntime`.

Antbox agents are **LLM agents only**. Workflow/composition agent types are not supported. Pi owns
model resolution, provider authentication, tool loops, conversation JSONL, and thinking levels.
Antbox owns tenant authorization, immutable session snapshots, skills, usage limits, and audit
events.

## AgentData

```ts
interface AgentData {
	uuid: string;
	name: string;
	description?: string;
	exposedToUsers: boolean;
	model?: [string] | [string, ThinkingLevel]; // ["default"] or explicit Pi model
	tools?: boolean | string[]; // true = all, false/undefined/[] = read only
	skills?: string[]; // optional allow-list of discovered skill names
	systemPrompt?: string; // defaults to a generic Antbox assistant prompt when omitted
	createdTime: string;
	modifiedTime: string;
}
```

Validation rules:

- `systemPrompt` is optional; when omitted, Antbox supplies a generic assistant prompt.
- agents default to `exposedToUsers: true` when omitted on create.
- `exposedToUsers: false` blocks direct `/chat` and `/answer`.

Model names retain Pi's `<provider>/<model>` format. The optional second tuple value is one of
`off`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max`; omission means `off`. Pi's
`ModelRuntime` owns built-in provider catalogs and environment-based credentials. Antbox does not
register Google, OpenAI, or Anthropic providers itself. Set `ai.modelsPath` to a Pi-compatible
`models.json` when a tenant needs custom providers such as Ollama, vLLM, or LM Studio.

Tool rules:

- `tools: true` -> all tools
- `tools: false` -> only `read`
- omitted `tools` -> same as `[]`, only `read`
- `tools: []` -> only `read`
- tool names exposed to the model are snake_case
- `run_code` remains available for advanced multi-step workflows

## Built-in agents

Every tenant exposes built-in agents such as:

- `--rag-agent--`
- `--aspect-field-extractor--`
- `--code-writer--`

Built-in agents can be listed and fetched, but cannot be updated or deleted.

## Endpoints

- `POST /v2/agents/-/upload` - create or replace a custom agent
- `GET /v2/agents` - list custom + built-in agents
- `GET /v2/agents/{uuid}` - get one agent
- `DELETE /v2/agents/{uuid}` - delete a custom agent
- `POST /v2/agents/{uuid}/-/chat` - interaction with caller-provided history
- `POST /v2/agents/{uuid}/-/answer` - same interaction model, but ignores history
- `POST /v2/agents/{uuid}/-/sessions` - create a persisted session with its first message
- `POST /v2/agents/{uuid}/-/sessions/{sessionId}/messages` - continue a persisted session
- `DELETE /v2/agents/{uuid}/-/sessions/{sessionId}` - delete a persisted session

## Create or replace example

Create a new agent:

```json
{
	"name": "Support Agent",
	"description": "General support assistant",
	"exposedToUsers": true,
	"model": ["default"],
	"tools": true
}
```

Replace an existing custom agent by UUID:

```json
{
	"uuid": "support-agent",
	"name": "Support Agent",
	"description": "General support assistant",
	"exposedToUsers": true,
	"model": ["default"],
	"tools": true
}
```

If `uuid` is omitted, Antbox creates a new custom agent and generates the UUID. If `uuid` is
provided and matches an existing custom agent, Antbox replaces it with the supplied payload (this is
not a partial update). If `systemPrompt` is omitted, Antbox uses a generic prompt tailored to Antbox
agent capabilities. Built-in/system agent UUIDs cannot be replaced.

## Chat and answer payloads

`POST /v2/agents/{uuid}/-/chat`

```json
{
	"text": "Find documents about invoice approval.",
	"options": {
		"history": [],
		"instructions": "Reply with concise bullet points"
	}
}
```

Chat history can include intermediate tool interaction turns. The legacy `/chat` endpoint still
accepts caller-provided history. The `files` option remains reserved and is currently ignored
because these endpoints accept JSON rather than multipart content.

`POST /v2/agents/{uuid}/-/answer`

```json
{
	"text": "Summarize this topic"
}
```

Persisted sessions store Pi JSONL under the tenant's `sessionsPath`, which defaults to
`<dataDir>/<tenant>/ai-sessions`. Create one with:

```json
{ "text": "Find the current contract" }
```

The response contains `sessionId`, `expiresAt`, and the final model `message`. Send later questions
to the session messages endpoint without resending history. Sessions expire 24 hours after creation,
use a fixed agent/tool/skill snapshot, and abort an individual run after five minutes.

Persisted sessions require authentication. Ownership is bound to the tenant, agent, and individual
user or API key; another API key cannot access a session even when its group is the same. Anonymous
requests return `401`. API key sessions created before credential-specific ownership was introduced
must be recreated; existing individual-user sessions remain compatible.

Queued messages recheck the token limit when their turn begins. The current quota counts recorded
agent-call tokens only, including the completed model calls of runs that later fail or time out. It
counts new input, cache writes, and output, but not cache reads, so resending the same context on
every model call does not inflate it. Events recorded before the cache breakdown existed count in
full. Usage is recorded asynchronously after a model run, so these checks do not reserve tokens for
in-flight calls. Concurrent sessions or delayed audit writes can exceed the configured threshold
before later requests are blocked.

The token metrics endpoint returns usage per source in `agents`, `embeddings`, and `ocr`, their
combined totals, and `quotaTokens`, the value compared with the limit. It returns an error if any
usage source cannot be read. Embeddings and OCR have no token quota check and keep running after the
agent quota is exhausted, so `totalTokens` differs from `quotaTokens`. The block applies at 105% of
the limit. RAG indexing, RAG queries, and the `?` semantic search path in node queries record
embedding usage. When Gemini cannot count embedding tokens, Antbox logs a warning and records an
estimate of one token per four characters. Model-based OCR records its usage during RAG indexing and
when the `OcrModel:ocr` tool runs.

## Tools

Current built-in function tools include:

- `run_code`
- `find_nodes`
- `get_node`
- `semantic_search`
- `read` (Pi's file reader, confined to the agent's skills; see `agent-skills`)

Feature-backed AI tools are also available when configured for the tenant and included in the
agent's `tools` allow-list. `read` is always available for agents. The names of the built-in tools are reserved and cannot be
used by feature-backed AI tools.

## Debugging agent runs

Antbox can emit detailed debug traces for AI agent runs through environment variables.

### Environment variables

- `ANTBOX_AGENT_DEBUG_TRACE`
  - enables agent-run debug tracing when set to `1`, `true`, `yes`, or `on`
  - logs selected tool names, Pi lifecycle events, finish reasons, error summaries, token usage, and
    response-size summaries
  - does not log prompts, additional instructions, tool arguments/results, API keys, or responses
- `ANTBOX_LOG_LEVEL`
  - controls log verbosity globally
  - valid values: `trace`, `debug`, `info`, `warn`, `error`, `fatal`
  - agent debug traces require this to allow debug output, typically `debug` or `trace`

### Example

```bash
ANTBOX_AGENT_DEBUG_TRACE=1 ANTBOX_LOG_LEVEL=debug ./start_server.sh --demo
```

If `config.toml` sets `logLevel`, Antbox uses that value when `ANTBOX_LOG_LEVEL` is not already set
in the environment. Setting `ANTBOX_LOG_LEVEL` explicitly overrides the config-derived value for the
current process.
