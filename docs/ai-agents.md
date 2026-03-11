---
name: ai-agents
description: Guide to AI agents in Antbox
---

# AI Agents

Agents are tenant-scoped configuration records executed by `AgentsEngine`.

Antbox supports two classes of agents:

- `llm`: a single LLM agent with prompt and tool access.
- workflow agents: orchestration over sub-agents (`sequential`, `parallel`, `loop`).

## AgentData

```ts
type AgentType = "llm" | "sequential" | "parallel" | "loop";

interface AgentData {
	uuid: string;
	name: string;
	description?: string;
	type?: AgentType; // default: "llm"
	exposedToUsers: boolean;

	// llm-only
	model?: string; // "default" or explicit provider model id
	tools?: boolean | string[]; // true = all, false/undefined/[] = skillLoader only
	systemPrompt?: string; // required for llm agents

	// workflow-only
	agents?: string[]; // required non-empty for workflow agents

	createdTime: string;
	modifiedTime: string;
}
```

Validation rules:

- `llm` agents require `systemPrompt`.
- workflow agents require non-empty `agents`.
- workflow agents must not define `systemPrompt`, `model`, or `tools`.
- agents default to `exposedToUsers: true` when omitted on create
- `exposedToUsers: false` blocks direct `/chat` and `/answer`, but the agent can still be used
  inside workflow agents

Tool rules for llm agents:

- `tools: true` -> all tools
- `tools: false` -> only `skillLoader`
- omitted `tools` -> same as `[]`, only `skillLoader`
- `tools: []` -> only `skillLoader`
- `tools: ["runCode"]` -> listed tools plus `skillLoader`

## Built-in agents

Every tenant exposes three read-only built-ins:

- `--rag-agent--`
- `--semantic-searcher-agent--`
- `--rag-summarizer-agent--`

Built-in agents can be listed and fetched, but cannot be updated or deleted.

- `--rag-agent--` is exposed to users
- `--semantic-searcher-agent--` is internal-only (`exposedToUsers: false`)
- `--rag-summarizer-agent--` is internal-only (`exposedToUsers: false`)

## Endpoints

- `POST /v2/agents/-/upload` - create an agent
- `GET /v2/agents` - list custom + built-in agents
- `GET /v2/agents/{uuid}` - get one agent
- `DELETE /v2/agents/{uuid}` - delete a custom agent
- `POST /v2/agents/{uuid}/-/chat` - multi-turn chat for agents with `exposedToUsers: true`
- `POST /v2/agents/{uuid}/-/answer` - single-turn answer for agents with `exposedToUsers: true`

## Create examples

### LLM agent

```json
{
	"name": "Support Agent",
	"description": "General support assistant",
	"type": "llm",
	"exposedToUsers": true,
	"model": "default",
	"tools": true,
	"systemPrompt": "You are a helpful support assistant."
}
```

### Sequential workflow agent

```json
{
	"name": "RAG Pipeline",
	"description": "Search then summarize",
	"type": "sequential",
	"exposedToUsers": true,
	"agents": ["--semantic-searcher-agent--", "--rag-summarizer-agent--"]
}
```

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

Current built-in function tool:

- `runCode`

Skill tools are also available when configured for the tenant and included in the agent's `tools`
allow-list. `skillLoader` is always available for llm agents.
