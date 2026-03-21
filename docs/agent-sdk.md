---
name: agent-sdk
description: Agent runCode SDK reference
---

# Agent SDK

Antbox agents use the `runCode` tool to execute server-side JavaScript/TypeScript.

The code runs with bound SDK proxies and the current user authentication context.

## Execution contract

`runCode` expects an ESM module that exports a default async function:

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
- `evaluate(uuid)`
- `find(filters, pageSize?, pageToken?)`
- `get(uuid)`
- `list(parent?)`
- `breadcrumbs(uuid)`
- `update(uuid, metadata)`
- `updateFile(uuid, file)`
- `lock(uuid, unlockAuthorizedGroups?)`
- `unlock(uuid)`

`find` accepts either normal filters or semantic query string (`"?query text"`).

## `aspects` SDK methods

- `listAspects()`
- `get(uuid)`

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
- node and aspect permissions are enforced exactly as regular API calls.
