---
name: llms
description: Platform context for LLMs
---

# Antbox LLM Playbook

This file is the practical runtime guide for LLM agents that need to operate Antbox safely and
effectively.

It is optimized for tasks such as:

- understanding architecture and tenant assembly
- authenticating and operating as root/admin
- creating and updating artifacts (folders/files/nodes)
- generating configuration entities (aspects, features, users, groups, API keys, agents)
- searching content, including semantic search
- loading focused documentation for specific jobs

## 1. System Model (High-Level)

Antbox is a multi-tenant ECM/DAM platform built with Deno + TypeScript.

Architecture layers:

- `domain/`: business models and contracts
- `application/`: services and engines
- `adapters/`: persistence, HTTP, storage, AI/OCR/embeddings

Each tenant is isolated with independent:

- node repository
- storage provider
- configuration repository
- event store
- crypto/auth keys

## 2. Tenant Configuration (What to Generate)

Server config is TOML with one or more tenants.

Core shape:

```toml
port = 7180

[[tenants]]
name = "default"
rootPasswd = "change-me"
storage = ["flat_file/flat_file_storage_provider.ts", "./storage"]
repository = ["sqlite/sqlite_node_repository.ts", "./data/tenant.db"]
configurationRepository = ["sqlite/sqlite_configuration_repository.ts", "./data/tenant.db"]
eventStoreRepository = ["sqlite/sqlite_event_store_repository.ts", "./data/tenant.db"]

[tenants.ai]
enabled = true
defaultModel = "google/gemini-2.5-flash"
embeddingProvider = ["embeddings/deterministic_embeddings_provider.ts", "1536"]
ocrProvider = ["ocr/null_ocr_provider.ts"]
skillsPath = "./skills"
```

Module configuration format is always:

- `["module-path.ts", "arg1", "arg2", ...]`

## 3. Authentication and Tenancy

### Root login

Endpoint:

- `POST /v2/login/root`

Request body must be the SHA-256 hex of tenant `rootPasswd` (not the raw password).

Example:

```bash
HASH=$(printf "%s" "change-me" | shasum -a 256 | cut -d' ' -f1)
curl -X POST http://localhost:7180/v2/login/root --data "$HASH"
```

### Auth resolution priority

1. `Authorization: ApiKey <secret>`
2. `Authorization: Bearer <jwt>`
3. `Cookie: token=<jwt>`
4. `?api_key=<secret>`
5. anonymous fallback

### Tenant resolution priority

1. `?x-tenant=<tenantName>`
2. `X-Tenant: <tenantName>`
3. first configured tenant

## 4. Core Content Artifacts (Folders, Files, Nodes)

### Create folder

`POST /v2/nodes`

```json
{
	"title": "Contracts",
	"mimetype": "application/vnd.antbox.folder",
	"parent": "--root--"
}
```

### Create file (recommended)

`POST /v2/nodes/-/upload` with multipart form-data:

- `file`: binary file
- `metadata`: JSON string (at minimum `parent` and optionally `title`, `mimetype`, etc.)

### Update node metadata

`PATCH /v2/nodes/{uuid}`

Use this for title/description/tags/aspects/properties/workflow-related metadata updates.

## 5. Aspects: Generation + Attribution to Nodes

### Create aspect

`POST /v2/aspects/-/upload`

Send `multipart/form-data` with a file in the `file` field. The file content is JSON.

UUID resolution rules:

- if the JSON payload contains `uuid`, that value is used
- otherwise Antbox uses the uploaded file name without the last extension
- spaces in the file name are replaced with `-`

Minimal aspect file:

```json
{
	"title": "Invoice Metadata",
	"description": "Structured fields for invoices",
	"filters": [["mimetype", "==", "application/pdf"]],
	"properties": [
		{
			"name": "status",
			"title": "Status",
			"type": "string",
			"required": true,
			"validationList": ["Pending", "Approved", "Rejected"],
			"defaultValue": "Pending"
		},
		{
			"name": "amount",
			"title": "Amount",
			"type": "number",
			"required": false
		}
	]
}
```

The create response contains the resolved aspect UUID. Use that UUID in node `aspects` and
`properties` keys.

### Attribute an aspect to a node

`PATCH /v2/nodes/{uuid}`

```json
{
	"aspects": ["<aspect_uuid>"],
	"properties": {
		"<aspect_uuid>:status": "Pending",
		"<aspect_uuid>:amount": 1299.50
	}
}
```

Critical rules:

- property keys must be prefixed: `${aspectUuid}:${propertyName}`
- aspect property names must match `/^[a-zA-Z_][_a-zA-Z0-9_]{2,}$/`
- when `aspects` changes, properties not belonging to selected aspects are dropped
- readonly aspect properties cannot be overridden by regular updates
- uuid/uuid[] aspect properties are existence-validated against nodes

## 6. Features: Generation with Action/Extension/AI Tool Focus

### Create feature record

`POST /v2/features/-/upload`

Send `multipart/form-data` with a file in the `file` field. The file content is a JavaScript module.
Antbox extracts metadata from `export default` and persists only the metadata plus `run`. Legacy
records that still contain `module` are normalized on read.

UUID resolution rules:

- if `export default.uuid` exists, that value is used
- otherwise Antbox uses the uploaded file name without the last extension
- spaces in the file name are replaced with `_`

Validation rules:

- at least one of `exposeAction`, `exposeExtension`, or `exposeAITool` must be `true`
- `runOnCreates`, `runOnUpdates`, and `runOnDeletes` are only allowed when `exposeAction` is `true`

Minimal valid module:

```javascript
export default {
	uuid: "tag_pending_invoices",
	title: "Tag Pending Invoices",
	description: "Adds pending tag to invoice nodes",
	exposeAction: true,
	runOnCreates: false,
	runOnUpdates: false,
	runOnDeletes: false,
	runManually: true,
	filters: [["aspects", "contains", "<aspect_uuid>"]],
	exposeExtension: false,
	exposeAITool: true,
	groupsAllowed: [],
	parameters: [
		{
			name: "uuids",
			type: "array",
			arrayType: "string",
			required: true,
			description: "Node UUIDs",
		},
	],
	returnType: "void",
	async run(ctx, args) {
		const uuids = Array.isArray(args.uuids) ? args.uuids : [];
		for (const uuid of uuids) {
			const n = await ctx.nodeService.get(uuid);
			if (n.isLeft()) continue;
			const tags = [...(n.value.tags || []), "pending"];
			await ctx.nodeService.update(uuid, { tags });
		}
	},
};
```

### Runtime contract for `module`

Feature execution imports `module` dynamically and uses `module.default` as the runnable feature
object.

Required in `module.default`:

- metadata fields (`uuid`, `title`, exposure flags, parameters, returnType)
- `run(ctx, args)` async function

`ctx` contains:

- `authenticationContext`
- `nodeService` (`NodeServiceProxy`)
- `logger` (`Logger.instance(...)` scoped to the feature and tenant)

Best practice for generation:

- put all metadata inside `module.default`
- set explicit feature `uuid` in the module for deterministic references
- keep helper logic inside `run`; only `run` is persisted from the uploaded module
- for actions, declare and expect a required `uuids` parameter with `type: "array"` and
  `arrayType: "string"`
- use `ctx.logger.info/warn/error(...)` for feature logs instead of importing logging helpers
- check `Either` results (`isLeft()`/`isRight()`) on every SDK call
- return deterministic JSON/string output when useful for AI-tool usage

### Feature mode matrix

- action feature: `exposeAction: true`, required `parameters` entry for `uuids: array<string>`,
  optional `runManually` and `runOnCreates/Updates/Deletes`
- extension feature: `exposeExtension: true` and extension-friendly `returnType`
- AI tool feature: `exposeAITool: true` and parameter schema designed for tool arguments

### Starter module snippets

Extension-oriented feature:

```javascript
export default {
	uuid: "health_extension",
	title: "Health Extension",
	description: "Simple extension response",
	exposeAction: false,
	runOnCreates: false,
	runOnUpdates: false,
	runOnDeletes: false,
	runManually: false,
	filters: [],
	exposeExtension: true,
	exposeAITool: false,
	groupsAllowed: [],
	parameters: [],
	returnType: "object",
	async run() {
		return { ok: true, ts: new Date().toISOString() };
	},
};
```

AI-tool-oriented feature:

```javascript
export default {
	uuid: "count_children_tool",
	title: "Count Children Tool",
	description: "Returns child count for a folder",
	exposeAction: false,
	runOnCreates: false,
	runOnUpdates: false,
	runOnDeletes: false,
	runManually: false,
	filters: [],
	exposeExtension: false,
	exposeAITool: true,
	groupsAllowed: [],
	parameters: [{ name: "parent", type: "string", required: true }],
	returnType: "object",
	async run(ctx, args) {
		const list = await ctx.nodeService.list(String(args.parent));
		if (list.isLeft()) return { error: list.value.message };
		return { count: list.value.length };
	},
};
```

### Feature exposure routes

- actions: `GET /v2/actions`, `POST /v2/actions/{uuid}/-/run`
- extensions: `GET /v2/extensions`, `GET|POST /v2/extensions/{uuid}/-/exec`
- AI tools: no dedicated public HTTP route; execution is engine-driven (agent/features runtime)

## 7. Configuration Entities (Admin Domain)

### Users

- `POST /v2/users`
- `GET /v2/users`
- `GET /v2/users/{email}`
- `PATCH /v2/users/{email}`
- `DELETE /v2/users/{uuid}` (known route mismatch, see quirks)

Create payload example:

```json
{
	"email": "jane@example.com",
	"title": "Jane Doe",
	"group": "--admins--",
	"groups": ["--admins--"],
	"hasWhatsapp": false,
	"active": true
}
```

### Groups

- `POST /v2/groups`
- `GET /v2/groups`
- `GET /v2/groups/{uuid}`
- `DELETE /v2/groups/{uuid}`

```json
{
	"title": "Finance",
	"description": "Finance team"
}
```

### API keys

- `POST /v2/api-keys`
- `GET /v2/api-keys`
- `GET /v2/api-keys/{uuid}`
- `DELETE /v2/api-keys/{uuid}`

```json
{
	"title": "CI key",
	"group": "--admins--",
	"description": "Pipeline key",
	"active": true
}
```

### Agents

- `POST /v2/agents/-/upload`
- `GET /v2/agents`
- `GET /v2/agents/{uuid}`
- `DELETE /v2/agents/{uuid}`
- `POST /v2/agents/{uuid}/-/chat`
- `POST /v2/agents/{uuid}/-/answer`

LLM agent example:

```json
{
	"name": "Ops Assistant",
	"description": "Operational helper",
	"type": "llm",
	"model": "default",
	"tools": ["runCode"],
	"systemPrompt": "You are an operations assistant for Antbox."
}
```

Workflow agent example:

```json
{
	"name": "RAG Pipeline",
	"type": "sequential",
	"agents": ["--semantic-searcher-agent--", "--rag-summarizer-agent--"]
}
```

## 8. Search (Structured + Semantic)

### Structured search

`POST /v2/nodes/-/find`

```json
{
	"filters": [["title", "match", "invoice"], ["mimetype", "==", "application/pdf"]],
	"pageSize": 20,
	"pageToken": 1
}
```

Supported operators:

- `==`, `!=`, `<`, `<=`, `>`, `>=`
- `in`, `not-in`
- `match`
- `contains`, `contains-all`, `contains-any`, `not-contains`, `contains-none`

Filter shape semantics:

- 1D array of tuples -> AND
- 2D array (`[[...], [...]]`) -> OR across groups, AND inside each group

### Semantic search

Use `filters` as a string starting with `?`:

```json
{
	"filters": "?invoice approval policy",
	"pageSize": 20,
	"pageToken": 1
}
```

Implementation notes:

- semantic threshold is owned by embeddings provider (`relevanceThreshold()`)
- client does not choose threshold in this path
- semantic results are relevance-sorted, then paginated
- when embeddings/search fail, fulltext fallback is used

## 9. `runCode` Tool Contract (AgentsEngine)

Built-in function tool currently available in `AgentsEngine`:

- `runCode`

`runCode` expects ESM code:

```javascript
export default async function ({ nodes, aspects, custom }) {
	const result = await nodes.find("?contract renewal", 10, 1);
	if (result.isLeft()) return JSON.stringify({ error: result.value.message });
	return JSON.stringify(result.value.nodes);
}
```

`nodes` SDK methods:

- `copy`, `create`, `createFile`, `delete`, `duplicate`, `export`, `evaluate`
- `find`, `get`, `list`, `breadcrumbs`
- `update`, `updateFile`, `lock`, `unlock`

`aspects` SDK methods:

- `listAspects`, `get`

All SDK calls return `Either<Error, Value>`.

## 10. Internal AI Tool Router (FeaturesEngine)

When code uses `FeaturesEngine.runAITool(...)` directly, these built-ins are supported:

- `NodeService:find|get|create|duplicate|copy|breadcrumbs|delete|update|export|list`
- `OcrModel:ocr`
- `Templates:list|get`
- `Docs:list|get`

This router is separate from `AgentsEngine` function tools.

## 11. Documentation Loading for Task-Specific Work

### API access

- `GET /v2/docs` -> list available docs
- `GET /v2/docs/{uuid}` -> fetch markdown body

When using internal tool routing through `FeaturesEngine.runAITool(...)`, docs can also be loaded
with:

- `Docs:list`
- `Docs:get` (requires `uuid`)

### Suggested doc selection by task

- setup/auth/login -> `getting-started`, `authentication`
- architecture/internals -> `architecture`, `adapters`
- nodes/aspects metadata design -> `nodes-and-aspects`
- feature authoring and execution -> `features`, `templates`
- AI agent behavior -> `ai-agents`, `agent-sdk`, `agent-skills`
- semantic/RAG behavior -> `llms`
- workflow orchestration -> `workflows`
- security admin entities -> `security-administration`
- audit and notifications -> `audit`, `notifications`
- content articles -> `articles`
- webdav integration -> `webdav`
- docs endpoint behavior itself -> `documentation-api`

## 12. Access Control Summary

High-level behavior:

- nodes: folder permission model (`Read`, `Write`, `Export`) + inheritance checks
- aspects: create/delete admin-only in current HTTP API; read/list available
- features: create/delete admin-only in current HTTP API; non-admin listing filtered by
  `groupsAllowed`
- agents: create/delete admin-only in current HTTP API; list/get available
- workflow definitions: admin writes; list/get available
- workflow instances: group/state constrained transitions and visibility
- users: list/delete admin-only; get/update self-or-admin
- groups: create/delete admin-only; list/get available
- api keys: admin-only create/list/get/delete
- audit: admin-only
- notifications: target-based access rules

## 13. Known Quirks and Guardrails

- `DELETE /v2/users/{uuid}` route currently names path param as `uuid`, but handler expects `email`.
- `/v2/docs` returns only entries registered in `docs/index.ts`.
- in `AgentsEngine`, do not assume non-existent runtime function tools such as
  `loadSdkDocumentation`; currently rely on `runCode` + skill tools.

## 14. Recommended LLM Execution Pattern

Use this sequence for safe execution:

1. retrieve (`get`/`find`/`list`)
2. check `isLeft()` / `isRight()`
3. mutate (`create`/`update`/`delete`) only after validation
4. return deterministic JSON/text

Template:

```javascript
export default async function ({ nodes }) {
	const found = await nodes.find([["title", "match", "invoice"]], 50, 1);
	if (found.isLeft()) {
		return JSON.stringify({ error: found.value.message });
	}

	const uuids = found.value.nodes.map((n) => n.uuid);
	return JSON.stringify({ count: uuids.length, uuids });
}
```

## 15. cURL Cookbook (Configuration + Artifacts)

The snippets below use `jq` for JSON extraction/building.

Note: infrastructure wiring (adapters, repositories, AI providers) is configured in TOML and loaded
at startup; cURL examples below cover runtime configuration entities and content artifacts.

### 15.1 Session bootstrap

```bash
BASE_URL="http://localhost:7180"
TENANT="default"
ROOT_PASSWORD="change-me"

ROOT_HASH=$(printf "%s" "$ROOT_PASSWORD" | shasum -a 256 | cut -d' ' -f1)

JWT=$(curl -sS -X POST "$BASE_URL/v2/login/root" \
  -H "X-Tenant: $TENANT" \
  --data "$ROOT_HASH" | jq -r '.jwt')

COMMON=(-H "X-Tenant: $TENANT" -H "Authorization: Bearer $JWT")
JSON=(-H "Content-Type: application/json")
```

### 15.2 Create folder + upload file

```bash
FOLDER_UUID=$(curl -sS -X POST "$BASE_URL/v2/nodes" \
  "${COMMON[@]}" "${JSON[@]}" \
  -d '{
    "title": "Contracts 2026",
    "mimetype": "application/vnd.antbox.folder",
    "parent": "--root--"
  }' | jq -r '.uuid')

FILE_UUID=$(curl -sS -X POST "$BASE_URL/v2/nodes/-/upload" \
  "${COMMON[@]}" \
  -F "file=@./sample.pdf;type=application/pdf" \
  -F "metadata={\"parent\":\"$FOLDER_UUID\",\"title\":\"Sample Contract\",\"mimetype\":\"application/pdf\"}" \
  | jq -r '.uuid')
```

### 15.3 Create aspect + attribute it to a node

```bash
cat > ./contract_metadata.json <<'EOF'
{
  "title": "Contract Metadata",
  "description": "Fields for contracts",
  "filters": [["mimetype", "==", "application/pdf"]],
  "properties": [
    {
      "name": "status",
      "title": "Status",
      "type": "string",
      "required": true,
      "validationList": ["Draft", "Approved", "Archived"],
      "defaultValue": "Draft"
    },
    {
      "name": "counterparty",
      "title": "Counterparty",
      "type": "string",
      "required": false
    }
  ]
}
EOF

ASPECT_UUID=$(curl -sS -X POST "$BASE_URL/v2/aspects/-/upload" \
  "${COMMON[@]}" \
  -F "file=@./contract_metadata.json;type=application/json" | jq -r '.uuid')

curl -sS -X PATCH "$BASE_URL/v2/nodes/$FILE_UUID" \
  "${COMMON[@]}" "${JSON[@]}" \
  -d "{
    \"aspects\": [\"$ASPECT_UUID\"],
    \"properties\": {
      \"$ASPECT_UUID:status\": \"Draft\",
      \"$ASPECT_UUID:counterparty\": \"ACME Ltd\"
    }
  }"
```

### 15.4 Create a feature (action + AI tool)

```bash
FEATURE_MODULE=$(cat <<'EOF'
export default {
  uuid: "mark_contract_approved",
  title: "Mark Contract Approved",
  description: "Updates status to Approved",
  exposeAction: true,
  runOnCreates: false,
  runOnUpdates: false,
  runOnDeletes: false,
  runManually: true,
  filters: [],
  exposeExtension: false,
  exposeAITool: true,
  groupsAllowed: [],
  parameters: [
    { name: "uuids", type: "array", arrayType: "string", required: true }
  ],
  returnType: "void",
  async run(ctx, args) {
    const uuids = Array.isArray(args.uuids) ? args.uuids : [];
    for (const uuid of uuids) {
      const node = await ctx.nodeService.get(uuid);
      if (node.isLeft()) continue;
      const properties = { ...(node.value.properties || {}), ["__ASPECT_UUID__:status"]: "Approved" };
      await ctx.nodeService.update(uuid, { properties });
    }
  },
};
EOF
)

FEATURE_MODULE=${FEATURE_MODULE//__ASPECT_UUID__/$ASPECT_UUID}
printf "%s" "$FEATURE_MODULE" > ./mark_contract_approved.js

FEATURE_UUID=$(curl -sS -X POST "$BASE_URL/v2/features/-/upload" \
	"${COMMON[@]}" \
	-F "file=@./mark_contract_approved.js;type=application/javascript" | jq -r '.uuid')
```

Run the action on one node:

```bash
curl -sS -X POST "$BASE_URL/v2/actions/$FEATURE_UUID/-/run" \
  "${COMMON[@]}" "${JSON[@]}" \
  -d "{\"uuids\":[\"$FILE_UUID\"]}"
```

Create and execute an extension feature:

```bash
EXT_MODULE=$(cat <<'EOF'
export default {
  uuid: "contracts_health_extension",
  title: "Contracts Health Extension",
  description: "Extension endpoint example",
  exposeAction: false,
  runOnCreates: false,
  runOnUpdates: false,
  runOnDeletes: false,
  runManually: false,
  filters: [],
  exposeExtension: true,
  exposeAITool: false,
  groupsAllowed: [],
  parameters: [],
  returnType: "object",
  async run() {
    return { ok: true, service: "contracts" };
  },
};
EOF
)

printf "%s" "$EXT_MODULE" > ./contracts_health_extension.js

EXT_UUID=$(curl -sS -X POST "$BASE_URL/v2/features/-/upload" \
	"${COMMON[@]}" \
	-F "file=@./contracts_health_extension.js;type=application/javascript" | jq -r '.uuid')

curl -sS -X GET "${COMMON[@]}" "$BASE_URL/v2/extensions/$EXT_UUID/-/exec"
```

### 15.5 Create groups, users, and API keys

```bash
GROUP_UUID=$(curl -sS -X POST "$BASE_URL/v2/groups" \
  "${COMMON[@]}" "${JSON[@]}" \
  -d '{"title":"Operations Team","description":"Operations users"}' | jq -r '.uuid')

curl -sS -X POST "$BASE_URL/v2/users" \
  "${COMMON[@]}" "${JSON[@]}" \
  -d "{
    \"email\": \"ops.bot@example.com\",
    \"title\": \"Ops Bot\",
    \"group\": \"$GROUP_UUID\",
    \"groups\": [\"$GROUP_UUID\"],
    \"hasWhatsapp\": false,
    \"active\": true
  }"

API_KEY_SECRET=$(curl -sS -X POST "$BASE_URL/v2/api-keys" \
  "${COMMON[@]}" "${JSON[@]}" \
  -d "{
    \"title\": \"Ops automation\",
    \"group\": \"$GROUP_UUID\",
    \"description\": \"Automation key\",
    \"active\": true
  }" | jq -r '.secret')
```

### 15.6 Create an LLM agent and ask a question

```bash
AGENT_UUID=$(curl -sS -X POST "$BASE_URL/v2/agents/-/upload" \
  "${COMMON[@]}" "${JSON[@]}" \
  -d '{
    "name": "Contract Assistant",
    "description": "Helps with contract repository tasks",
    "type": "llm",
    "model": "default",
    "tools": ["runCode"],
    "systemPrompt": "You are a contract operations assistant for Antbox."
  }' | jq -r '.uuid')

curl -sS -X POST "$BASE_URL/v2/agents/$AGENT_UUID/-/answer" \
  "${COMMON[@]}" "${JSON[@]}" \
  -d '{"text":"List the main folders and what they contain."}'
```

### 15.7 Configure workflow definition and start instance

```bash
WORKFLOW_UUID=$(curl -sS -X POST "$BASE_URL/v2/workflow-definitions" \
  "${COMMON[@]}" "${JSON[@]}" \
  -d '{
    "title": "Contract Approval Workflow",
    "description": "Draft -> Approved",
    "availableStateNames": ["Draft", "Approved"],
    "filters": [["mimetype", "!=", "application/vnd.antbox.folder"]],
    "groupsAllowed": ["--admins--"],
    "states": [
      {
        "name": "Draft",
        "isInitial": true,
        "transitions": [
          { "signal": "approve", "targetState": "Approved", "groupsAllowed": ["--admins--"] }
        ]
      },
      {
        "name": "Approved",
        "isFinal": true
      }
    ]
  }' | jq -r '.uuid')

curl -sS -X POST "$BASE_URL/v2/workflow-instances/$FILE_UUID/-/start" \
  "${COMMON[@]}" "${JSON[@]}" \
  -d "{\"workflowDefinitionUuid\":\"$WORKFLOW_UUID\"}"
```

### 15.8 Structured + semantic search

```bash
curl -sS -X POST "$BASE_URL/v2/nodes/-/find" \
  "${COMMON[@]}" "${JSON[@]}" \
  -d "{
    \"filters\": [[\"parent\", \"==\", \"$FOLDER_UUID\"]],
    \"pageSize\": 20,
    \"pageToken\": 1
  }"

curl -sS -X POST "$BASE_URL/v2/nodes/-/find" \
  "${COMMON[@]}" "${JSON[@]}" \
  -d '{
    "filters": "?contract approval policy",
    "pageSize": 20,
    "pageToken": 1
  }'
```

### 15.9 Load documentation for a specific task

```bash
curl -sS "${COMMON[@]}" "$BASE_URL/v2/docs"
curl -sS "${COMMON[@]}" "$BASE_URL/v2/docs/features"
curl -sS "${COMMON[@]}" "$BASE_URL/v2/docs/workflows"
```
