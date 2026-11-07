---
name: agent-sdk
description: Agent run_code SDK reference
---

# Agent SDK

Antbox agents use the `run_code` tool to execute server-side JavaScript/TypeScript.

The code runs with bound SDK proxies and the current user authentication context.

## Execution contract

`run_code` expects an ESM module that exports a default async function:

```javascript
export default async function ({ nodes, aspects, custom }) {
	const result = await nodes.list("--root--");
	if (result.isLeft()) {
		return JSON.stringify({ error: result.value.message });
	}
	return JSON.stringify(result.value);
}
```

The function receives:

- `nodes`: `NodeServiceProxy`
- `aspects`: `AspectServiceProxy`
- `custom`: reserved object (currently empty unless explicitly wired)

## `nodes` SDK methods

- `copy(uuid, parent)`
- `create(metadata)`
- `createFile(file, metadata)`
- `delete(uuid)`
- `duplicate(uuid)`
- `export(uuid)`
- `exportAll(uuids)` — returns a ZIP `File` (100 distinct identifiers / 100 MiB limit)
- `evaluate(uuid)`
- `find(filters, pageSize?, pageToken?)` — `{ nodes, pageSize, pageToken, scores? }`
- `semanticQuery(text)` — top 10 `RagDocument`s (`uuid`, `title`, `content`, `score`)
- `findDocuments({ filters?, query?, limit?, includeContent?, maxCharsPerNode? })` — the readable
  nodes matching filters and/or ranked by a query, with their stored text, in one call:
  `{ mode, total, totalIsLowerBound?, returned, notice?, nodes }`. Backs the `find_documents` tool;
  see [AI Agents](ai-agents.md#tools)
- `get(uuid)`
- `getEmbeddingContents(uuids)` — stored markdown keyed by readable node UUID
- `list(parent?)`
- `breadcrumbs(uuid)` — `{ uuid, title }[]`
- `update(uuid, metadata)` — no value on success; call `get` to read the node
- `updateFile(uuid, file)` — no value on success
- `lock(uuid, unlockAuthorizedGroups?)`, `unlock(uuid)` — no value on success

`find` accepts filter arrays, a semantic query string (`"?query text"`), filter notation
(`"inv-uuid:status == open"`), or other text, which runs a full-text search. `pageToken` is the
page number: request `pageToken + 1` until a page has fewer than `pageSize` nodes.

## `aspects` SDK methods

- `listAspects()` — `Either` with every aspect, sorted by title
- `get(uuid)`

Both are read-only: aspects are configuration records, not nodes, and only admins create, replace,
or delete them over REST (see `nodes-and-aspects`). `aspects` exists only in `run_code`; feature
`run(ctx, args)` receives `authenticationContext`, `nodeService`, `logger`, and an optional
`requestUrl`, but no aspects SDK.

## Error handling (`Either`)

SDK methods return `Either<Error, Value>`:

```javascript
const nodeOrErr = await nodes.get("some-uuid");

if (nodeOrErr.isLeft()) {
	return JSON.stringify({ error: nodeOrErr.value.message });
}

return JSON.stringify(nodeOrErr.value);
```

## Best practices

- always check `isLeft()` before using `.value` as success data.
- return JSON strings (`JSON.stringify(...)`) for deterministic downstream parsing.
- keep code focused on retrieval and mutation; keep explanation in agent text response.

## Security model

- proxies bind the current authentication context.
- code cannot inject arbitrary credentials to bypass platform ACL checks.
- node and aspect permissions are checked by the same services as regular API calls, with one
  difference for stored text. `GET /v2/nodes/{uuid}/-/content-md` requires **Read** and **Export**
  on the parent folder, but `getEmbeddingContents`, `semanticQuery` and `findDocuments` (and the
  `semantic_search` and `find_documents` tools), and the built-in `auto_tag` and `call_agent` actions return a node's stored markdown,
  including the text extracted from the file, with **Read** only. `export` and `exportAll` still
  require **Export**.
