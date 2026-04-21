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

- `POST /v2/agents/-/upload` - create an agent
- `GET /v2/agents` - list custom + built-in agents
- `GET /v2/agents/{uuid}` - get one agent
- `DELETE /v2/agents/{uuid}` - delete a custom agent
- `POST /v2/agents/{uuid}/-/chat` - interaction with caller-provided history
- `POST /v2/agents/{uuid}/-/answer` - same interaction model, but ignores history

## Create example

```json
{
	"name": "Support Agent",
	"description": "General support assistant",
	"exposedToUsers": true,
	"model": "default",
	"tools": true
}
```

If `systemPrompt` is omitted, Antbox uses a generic prompt tailored to Antbox agent capabilities.

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

Current built-in function tools include:

- `run_code`
- `find_nodes`
- `get_node`
- `semantic_search`
- `load_skill`

Feature-backed AI tools are also available when configured for the tenant and included in the
agent's `tools` allow-list. `load_skill` is always available for agents.
