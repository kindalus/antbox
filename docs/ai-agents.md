---
name: ai-agents
description: Guide to AI agents in Antbox
---

# AI Agents

Agents are tenant-scoped configuration records executed by `AgentsEngine`.

Antbox agents are **LLM agents only**. Workflow/composition agent types are not supported.

## AgentData

```ts
interface AgentData {
	uuid: string;
	name: string;
	description?: string;
	exposedToUsers: boolean;
	model?: string; // "default" or explicit provider model id
	tools?: boolean | string[]; // true = all, false/undefined/[] = load_skill only
	systemPrompt?: string; // defaults to a generic Antbox assistant prompt when omitted
	maxLlmCalls?: number;
	createdTime: string;
	modifiedTime: string;
}
```

Validation rules:

- `systemPrompt` is optional; when omitted, Antbox supplies a generic assistant prompt.
- agents default to `exposedToUsers: true` when omitted on create.
- `exposedToUsers: false` blocks direct `/chat` and `/answer`.

Tool rules:

- `tools: true` -> all tools
- `tools: false` -> only `load_skill`
- omitted `tools` -> same as `[]`, only `load_skill`
- `tools: []` -> only `load_skill`
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

## Create or replace example

Create a new agent:

```json
{
	"name": "Support Agent",
	"description": "General support assistant",
	"exposedToUsers": true,
	"model": "default",
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
	"model": "default",
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
		"temperature": 0.3,
		"maxTokens": 1024,
		"instructions": "Reply with concise bullet points"
	}
}
```

Chat history can include intermediate tool interaction turns. Antbox now preserves and replays model
tool calls and tool responses across `/chat` requests so the next request can continue with that
context.

`POST /v2/agents/{uuid}/-/answer`

```json
{
	"text": "Summarize this topic",
	"options": {
		"temperature": 0.2,
		"maxTokens": 512
	}
}
```

## Tools

Current built-in function tools include:

- `run_code`
- `find_nodes`
- `get_node`
- `semantic_search`
- `load_skill`

Feature-backed AI tools are also available when configured for the tenant and included in the
agent's `tools` allow-list. `load_skill` is always available for agents.

## Debugging agent runs

Antbox can emit detailed debug traces for ADK-based agent runs through environment variables.

### Environment variables

- `ANTBOX_AGENT_DEBUG_TRACE`
  - enables agent-run debug tracing when set to `1`, `true`, `yes`, or `on`
  - logs the effective agent instruction, selected tools, important ADK events, tool calls, tool
    responses, finish reasons, error codes/messages, and final text summary
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
