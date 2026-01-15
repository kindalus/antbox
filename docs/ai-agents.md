# AI Agents

Agents are tenant-scoped configuration records that describe how the AI should behave. They are
executed by the AgentsEngine using the AI models configured for the tenant.

## Agent Configuration

```ts
interface AgentData {
  uuid: string; // generated on create
  title: string;
  description?: string;
  model: string; // model name or "default"
  temperature: number; // 0.0 - 2.0
  maxTokens: number;
  reasoning: boolean;
  useTools: boolean;
  systemInstructions: string;
  createdTime: string;
  modifiedTime: string;
}
```

Notes:

- Use `model: "default"` to target the tenant's default model.
- `useTools: true` enables internal tools (`getSdkDocumentation`, `runCode`).

## Endpoints

- **Create**: `POST /v2/agents/-/upload`
- **List**: `GET /v2/agents`
- **Get**: `GET /v2/agents/{uuid}`
- **Delete**: `DELETE /v2/agents/{uuid}`
- **List models**: `GET /v2/ai-models`

Notes:

- Create/Delete and model listing require admin privileges.

### Create Example

```json
{
  "title": "Support Agent",
  "description": "Handles common support questions",
  "model": "default",
  "temperature": 0.3,
  "maxTokens": 2048,
  "reasoning": false,
  "useTools": true,
  "systemInstructions": "You are a helpful support assistant."
}
```

## Chat and Answer

### Chat

`POST /v2/agents/{uuid}/-/chat`

```json
{
  "text": "Hello!",
  "options": {
    "history": [],
    "temperature": 0.5,
    "maxTokens": 1024,
    "instructions": "Keep responses short"
  }
}
```

### Answer (single-turn)

`POST /v2/agents/{uuid}/-/answer`

```json
{
  "text": "Summarize the document",
  "options": {
    "temperature": 0.2,
    "maxTokens": 512
  }
}
```

Responses return a chat history (`ChatMessage[]`). Each message has `role` (`user`, `model`, `tool`)
and `parts` (text/tool call/response).

## RAG Chat

`POST /v2/agents/rag/-/chat`

```json
{
  "text": "What is in this folder?",
  "options": {
    "parent": "<folder-uuid>",
    "history": [],
    "temperature": 0.4,
    "maxTokens": 1024
  }
}
```

RAG is only available when AI is enabled for the tenant (models + vector database configured).
