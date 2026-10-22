---
name: node-querying
description: Query and search nodes with semantic, metadata, and aspect filters
---

# Node Querying

This guide focuses on querying and searching nodes with `run_code` using `NodeServiceProxy.find`.

## run_code pattern

All code must export a default async function receiving `{ nodes, aspects }`.

```javascript
export default async function ({ nodes, aspects }) {
	// your query logic here
	return JSON.stringify(result);
}
```

## Querying strategies

### 1. Semantic search (natural language)

Use `semanticQuery` for embedding-based search. It returns `RagDocument[]` with `uuid`, `title`,
`content`, and `score`.

```javascript
export default async function ({ nodes }) {
	const result = await nodes.semanticQuery("contract termination clauses");
	if (result.isLeft()) return JSON.stringify({ error: result.value });
	return JSON.stringify(result.value);
}
```

### 2. Metadata filters (AND logic)

```javascript
export default async function ({ nodes }) {
	const result = await nodes.find([
		["mimetype", "==", "application/pdf"],
		["tags", "contains", "urgent"],
	]);
	if (result.isLeft()) return JSON.stringify({ error: result.value.message });
	return JSON.stringify(result.value.nodes);
}
```

### 3. OR logic (2D array)

```javascript
export default async function ({ nodes }) {
	const result = await nodes.find([
		[["aspect-uuid:status", "==", "open"]],
		[["aspect-uuid:status", "==", "pending"]],
	]);
	if (result.isLeft()) return JSON.stringify({ error: result.value.message });
	return JSON.stringify(result.value.nodes);
}
```

### 4. Aspect-based query

```javascript
export default async function ({ nodes, aspects }) {
	const allAspects = await aspects.listAspects();
	const target = allAspects.find((a) => a.title.toLowerCase().includes("invoice"));
	if (!target) return JSON.stringify({ error: "Aspect not found" });

	const result = await nodes.find([
		["aspects", "contains", target.uuid],
		[`${target.uuid}:status`, "==", "open"],
	]);
	if (result.isLeft()) return JSON.stringify({ error: result.value.message });
	return JSON.stringify({ count: result.value.nodes.length, nodes: result.value.nodes });
}
```

### 5. Full-text query

```javascript
export default async function ({ nodes }) {
	const result = await nodes.find([["fulltext", "match", "annual revenue 2024"]]);
	if (result.isLeft()) return JSON.stringify({ error: result.value.message });
	return JSON.stringify(result.value.nodes);
}
```

## Filter operators

| Operator             | Use                           |
| -------------------- | ----------------------------- |
| `==`, `!=`           | Exact match / not equal       |
| `<`, `<=`, `>`, `>=` | Numeric or date comparison    |
| `match`              | Full-text match               |
| `contains`           | Array contains value          |
| `contains-all`       | Array contains all values     |
| `contains-any`       | Array contains any value      |
| `contains-none`      | Array contains none of values |
| `not-contains`       | Array does not contain value  |
| `in`, `not-in`       | Membership against a list     |

`match` searches for literal, case-insensitive terms in their given order. Whitespace separates
terms; punctuation such as `[draft]`, `C++`, `%`, and `_` is literal rather than query syntax. Array
operators (`in`, `not-in`, `contains-all`, `contains-any`, `contains-none`) require array values.
`contains-none` succeeds only when none of the supplied values is present.

An empty filter list accepts every node allowed by the caller's permissions. An empty AND group
inside an OR expression is also unconditional. A parent filter that matches no folders returns no
nodes.

## Common queryable fields

- `uuid`, `title`, `description`, `mimetype`, `parent`, `owner`
- `createdTime`, `modifiedTime`
- `size`, `fulltext`
- `tags`, `aspects`, `related`
- `${aspectUuid}:${propertyName}` for aspect properties

## Strategy

HTTP and MCP searches accept `pageSize` from 1 to 200, with a default of 20, and a positive integer
`pageToken`, with a default of 1. Invalid HTTP pagination returns `400`. Pagination values and their
product must be safe integers. Internal service calls can request larger pages for bulk operations.

Semantic searches using the `?` prefix are limited to the first 10,000 candidates:
`pageSize * pageToken <= 10000`. The service rejects larger windows before requesting embeddings.

1. Use `semanticQuery` for conceptual/natural language queries, then refine with metadata filters
   via `find`.
2. Discover aspect UUIDs with `aspects.listAspects()` before aspect-property filtering.
3. Always check `isLeft()` before reading `result.value`.
4. Use `pageSize` and `pageToken` for large result sets.
5. Return titles and UUIDs in responses when summarizing findings.
