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
	const aspectsOrErr = await aspects.listAspects();
	if (aspectsOrErr.isLeft()) return JSON.stringify({ error: aspectsOrErr.value.message });
	const target = aspectsOrErr.value.find((a) => a.title.toLowerCase().includes("invoice"));
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
| `match`              | Text match (see below)        |
| `contains`           | Array contains value          |
| `contains-all`       | Array contains all values     |
| `contains-any`       | Array contains any value      |
| `contains-none`      | Array contains none of values |
| `not-contains`       | Array does not contain value  |
| `in`, `not-in`       | Membership against a list     |

On an ordinary field, `match` searches for literal, case-insensitive terms in their given order.
Whitespace separates terms; punctuation such as `[draft]`, `C++`, `%`, and `_` is literal rather
than query syntax. On `fulltext`, `match` is a full-text search (next section). Array
operators (`in`, `not-in`, `contains-all`, `contains-any`, `contains-none`) require array values.
`contains-none` succeeds only when none of the supplied values is present.

Use `match` for text and the `contains` family only on array fields such as `tags`, `aspects`,
`related` or array properties. On a non-array value the result depends on the repository (the
in-memory one does a substring test; SQLite logs an error and returns no nodes), so never use
`contains` on a string field.

In the filter string notation (`"size > 1000, mimetype == application/pdf | …"`), values are text,
except an unquoted number after `<`, `<=`, `>` or `>=`, which is a number: `size > 1000` compares
numerically. A quoted number (`size > "1000"`) is text, and comparing text with a number field gives
results that depend on the database: the in-memory repository coerces it, while SQL databases may
match every node or none depending on the operator. Always leave numbers unquoted. `==` and `!=`
always compare text, so a value such as
a NIF stored as a string still matches. For the same reason, `invoice:amount == 100` never matches a
`number` aspect property: use the array form `[["invoice:amount", "==", 100]]`, or a range in
notation, `invoice:amount >= 100, invoice:amount <= 100`. Booleans and lists are text too:
`invoice:paid == true` compares with `"true"` and `invoice:amount in (100, 200)` with
`["100", "200"]`, so neither matches a `boolean` or `number` property. Use the array form
instead: `[["invoice:paid", "==", true]]`, `[["invoice:amount", "in", [100, 200]]]`.

Aspect properties are filtered as `aspectUuid:propertyName` (`properties.aspectUuid:propertyName`
also works); a bare property name such as `status` is not an aspect property.

### Parent-folder filters (`@field`)

A field starting with `@` filters on the node's parent folder: `["@title", "==", "Invoices"]` finds
nodes whose parent folder is titled `Invoices`. In searches, the `@` filters of each AND group are
run first as a folder query (the `@` removed, restricted to folders, the root folder included, and
to the uuids of any `parent` filter in the group). The group then becomes `parent in [those
folders]` plus its other filters; when no folder matches, the group matches no nodes.

`@` filters are resolved only in searches (`find`, `find_nodes`, smart folders). In filters checked
against one node, such as an aspect's `filters`, `@title` is read as an ordinary field that nodes do
not have, so do not use them there (in `validationFilters` they are ignored).

An empty filter list accepts every node allowed by the caller's permissions. An empty AND group
inside an OR expression is also unconditional. A parent filter that matches no folders returns no
nodes.

## Full-text search

`["fulltext", "match", "<text>"]`, and any `find` string that is not filter notation, runs a
full-text search with the database's own engine. `fulltext` is not a node field: the search reads
a separate index with two parts.

A string is filter notation whenever it looks like `word op value`: a single word followed by `==`,
`!=`, `<`, `<=`, `>`, `>=`, or by a spaced word operator such as `match` or `contains`. So
`price == 10`, `contract match renewal`, or `team contains alice` are parsed as filters, not
searched as text. To force a full-text search, use `[["fulltext", "match", "<text>"]]`.

- **Metadata:** title, description, tags and the values of aspect properties marked `searchable`.
  It ranks above the body. Other frontmatter fields (uuids, owner, dates, mimetypes) are not
  indexed.
- **Body:** the text the OCR provider extracted from the file. It exists only with AI indexing
  enabled and for supported file types, and is added when extraction finishes. Without AI only the
  metadata is searchable, even for text files.

Results come best match first, with a `scores` map of uuid to relevance between 0 and 1. Scores
compare nodes within one search, not across databases. Search syntax in the text is never
interpreted: quotes, `*`, `:`, `&`, `|`, `!`, parentheses and `-` only separate words, and a text
without words matches nothing.

Matching depends on the tenant's database:

| Database   | All words required | Prefixes (`fact` finds `factura`) | Accents ignored | Portuguese stemming          | Ranking               |
| ---------- | ------------------ | --------------------------------- | --------------- | ---------------------------- | --------------------- |
| SQLite     | yes                | yes                               | yes             | no                           | bm25                  |
| PostgreSQL | yes                | yes                               | yes (1)         | yes                          | ts_rank_cd            |
| MongoDB    | yes                | no                                | yes             | yes, one way (2)             | textScore             |
| In-memory  | yes, in order      | anywhere inside a word            | yes             | no                           | none (score 1)        |

1. Needs the `unaccent` extension. When the database user cannot create it, PostgreSQL logs a
   warning at startup and uses the plain `portuguese` configuration, where accents must match.
2. MongoDB matches a word whose stem equals the query word's stem and whose text contains the query
   word: `factura` finds `facturas`, but `facturas` does not find `factura`.

None of the engines match the middle of a word, except the in-memory repository.

A search runs one full-text query. With OR groups, every group must carry the same `fulltext`
text; the service applies the other filters of each group, including permissions, before
pagination. A `fulltext` filter in only some groups, or with different texts in different groups,
returns `400`. `fulltext` filters are accepted in searches and smart folders, and rejected in
folder, aspect (`filters` and property `validationFilters`), feature and workflow filters, which
are checked against one node at a time.

Nodes stored before this search existed are indexed from their metadata in the background when
the server starts. Until that finishes they are missing from full-text results.

## Common queryable fields

- `uuid`, `title`, `description`, `mimetype`, `parent`, `owner`
- `createdTime`, `modifiedTime`
- `size`
- `tags`, `aspects`, `related`
- `${aspectUuid}:${propertyName}` for aspect properties

## Strategy

HTTP and MCP searches accept `pageSize` from 1 to 200, with a default of 20, and a positive integer
`pageToken`, with a default of 1. Invalid HTTP pagination returns `400`. Pagination values and their
product must be safe integers. Internal service calls can request larger pages for bulk operations.

Semantic searches using the `?` prefix are limited to the first 10,000 candidates:
`pageSize * pageToken <= 10000`. The service rejects larger windows before requesting embeddings.

Semantic results (`?` searches and `semanticQuery`) contain only nodes the caller can read. The
permission filter runs before the result limit, so nodes the caller cannot read never take the
place of readable ones. Results must reach the embeddings provider's relevance threshold. When no
result reaches it, the threshold drops once by 0.1 (for example from 0.6 to 0.5); when no result
reaches the lowered threshold, the search returns no nodes and does not fall back to fulltext.
Only `?` searches fall back to fulltext, and only when semantic search is unavailable or fails.
`semanticQuery` and the agents' `semantic_search` tool never fall back: they return a Left
(`"Service not available"` when the tenant has no semantic search, otherwise the error).

### Semantic index

Node creations and updates are indexed in the background through a queue with two concurrent jobs
per tenant. Folders, metanodes, smart folders and articles are indexed from their metadata. Files
are indexed with the text extracted by the OCR provider only when their type is in
`EMBEDDINGS_SUPPORTED_MIMETYPES` (`domain/nodes/embedding.ts`): plain text, PDF, HTML, Markdown,
Word, RTF, CSV and XLSX. Other files get no OCR and no embedding. Transient provider errors (HTTP
408, 429, 5xx, timeouts and network errors) are retried up to four times with growing waits.

Each node keeps an indexing status: `indexed`, `failed` (the error is kept; a failed OCR still
stores an embedding of the metadata), `skipped` (unsupported file type) or pending (never
processed). Tenant administrators can inspect and repair the index:

- `GET /v2/nodes/-/embeddings/status` returns the counts per status, the last reindex job and the
  most recent failures since the server started.
- `POST /v2/nodes/-/embeddings/reindex` with `{"mode": "missing"}` (the default) indexes pending
  and failed nodes; `{"mode": "all"}` indexes every eligible node again. Reindexing uses OCR and
  embedding tokens, does not publish `EmbeddingCreated`/`EmbeddingUpdated` events (so
  `onEmbeddings*` hooks do not run), and only one reindex runs at a time per tenant. Queued work is
  kept in memory: after a restart, run `missing` again.

1. Use `semanticQuery` for conceptual/natural language queries, then refine with metadata filters
   via `find`.
2. Discover aspect UUIDs with `aspects.listAspects()` (it returns an `Either`) before
   aspect-property filtering.
3. Always check `isLeft()` before reading `result.value`.
4. Use `pageSize` and `pageToken` for large result sets.
5. Return titles and UUIDs in responses when summarizing findings.
