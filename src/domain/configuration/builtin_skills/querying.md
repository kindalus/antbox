---
name: querying
description: Query and search nodes in Antbox using filters. Use when searching for documents, business entities, or any data. Covers filter operators, aspect queries, date ranges, and semantic search.
---

# Querying Nodes in Antbox

## Quick Start

Use `nodes.find(filters)` to search for nodes. Filters are arrays of conditions.

**Basic pattern:**
```javascript
const result = await nodes.find([
  ["field", "operator", "value"]
]);

if (result.isLeft()) {
  return JSON.stringify({ error: result.value.message });
}
return JSON.stringify({ nodes: result.value.nodes });
```

**Find all business entities of a type:**
```javascript
await nodes.find([["aspects", "contains", "customer-aspect-uuid"]])
```

**Find by aspect property:**
```javascript
await nodes.find([
  ["aspects", "contains", "invoice-aspect-uuid"],
  ["invoice-aspect-uuid:status", "==", "open"]
])
```

For detailed operator reference, see [Filter Operators](#filter-operators).
For query patterns by use case, see [Query Patterns](#query-patterns).
For working with aspects, see [Aspect Queries](#aspect-queries).

## Filter Operators

### Comparison Operators

Use for strings, numbers, and dates (ISO 8601 format):

| Operator | Description | Example |
|----------|-------------|---------|
| `==` | Exact equality | `["title", "==", "Invoice #001"]` |
| `!=` | Not equal | `["status", "!=", "deleted"]` |
| `<` | Less than | `["amount", "<", 1000]` |
| `<=` | Less than or equal | `["size", "<=", 10485760]` |
| `>` | Greater than | `["amount", ">", 5000]` |
| `>=` | Greater than or equal | `["createdTime", ">=", "2024-01-01T00:00:00Z"]` |

### Text Search Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `match` | Full-text search in extracted content | `["fulltext", "match", "contract terms"]` |

**Semantic search** (AI-powered): Pass a string starting with `?`
```javascript
await nodes.find("?documents about project deadlines")
```
Note: Semantic search cannot be combined with other filters.

### Set Operators

Check if a value is in (or not in) a list of options:

| Operator | Description | Example |
|----------|-------------|---------|
| `in` | Value is one of the options | `["status", "in", ["open", "pending"]]` |
| `not-in` | Value is NOT one of the options | `["status", "not-in", ["cancelled", "deleted"]]` |

### Array Operators

For array fields like `tags`, `aspects`, `related`:

| Operator | Description | Example |
|----------|-------------|---------|
| `contains` | Array contains the value | `["tags", "contains", "urgent"]` |
| `contains-all` | Array contains ALL values | `["tags", "contains-all", ["urgent", "reviewed"]]` |
| `contains-any` | Array contains ANY value | `["tags", "contains-any", ["urgent", "priority"]]` |
| `not-contains` | Array does NOT contain value | `["tags", "not-contains", "archived"]` |
| `contains-none` | Array contains NONE of values | `["tags", "contains-none", ["deleted", "spam"]]` |

## Query Patterns

### Combining Filters (AND Logic)

Use a 1D array - all conditions must match:
```javascript
await nodes.find([
  ["mimetype", "==", "application/pdf"],
  ["size", ">", 1000000],
  ["tags", "contains", "urgent"]
])
// Returns: PDFs larger than 1MB with "urgent" tag
```

### OR Logic (2D Array)

Use a 2D array - any row can match:
```javascript
await nodes.find([
  [["invoice-uuid:status", "==", "open"]],
  [["invoice-uuid:status", "==", "pending"]],
  [["invoice-uuid:status", "==", "overdue"]]
])
// Returns: Invoices with status open OR pending OR overdue
```

### Complex Queries (AND + OR)

Combine AND within rows, OR between rows:
```javascript
await nodes.find([
  [["mimetype", "==", "application/pdf"], ["size", ">", 5000000]],
  [["mimetype", "in", ["image/png", "image/jpeg"]], ["tags", "contains", "important"]]
])
// Returns: (Large PDFs) OR (Important images)
```

### Date Range Queries

```javascript
// This month's documents
const now = new Date();
const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString();

await nodes.find([
  ["createdTime", ">=", firstDay],
  ["createdTime", "<=", lastDay]
])
```

### Pagination

```javascript
// First page (50 results)
const page1 = await nodes.find(filters, 50);

// Next page
if (page1.value.nextPageToken) {
  const page2 = await nodes.find(filters, 50, page1.value.nextPageToken);
}
```

## Aspect Queries

### Understanding Aspect Properties

When a node has an aspect, its properties are stored with the pattern:
`aspectUuid:propertyName`

Example: An invoice node might have:
```json
{
  "aspects": ["invoice-aspect-uuid"],
  "properties": {
    "invoice-aspect-uuid:amount": 1500.50,
    "invoice-aspect-uuid:status": "open",
    "invoice-aspect-uuid:customerId": "customer-node-uuid"
  }
}
```

### Finding All Entities of a Type

```javascript
// Find all invoices
await nodes.find([["aspects", "contains", "invoice-aspect-uuid"]])

// Find all customers
await nodes.find([["aspects", "contains", "customer-aspect-uuid"]])
```

### Filtering by Aspect Property

```javascript
// Find open invoices
await nodes.find([
  ["aspects", "contains", "invoice-aspect-uuid"],
  ["invoice-aspect-uuid:status", "==", "open"]
])

// Find high-value invoices
await nodes.find([
  ["aspects", "contains", "invoice-aspect-uuid"],
  ["invoice-aspect-uuid:amount", ">", 10000]
])
```

### Following Relationships

Aspect properties can reference other nodes by UUID:
```javascript
// Find all invoices for a specific customer
await nodes.find([
  ["aspects", "contains", "invoice-aspect-uuid"],
  ["invoice-aspect-uuid:customerId", "==", "customer-node-uuid"]
])
```

### Discovering the Data Model

Always start by discovering available aspects:
```javascript
const allAspects = await aspects.listAspects();
return JSON.stringify({ aspects: allAspects });
```

Then examine the aspect properties to understand the schema before querying.

## Queryable Fields Reference

### Core Node Fields

| Field | Type | Description |
|-------|------|-------------|
| `uuid` | string | Unique identifier |
| `fid` | string | Friendly ID |
| `title` | string | Display name |
| `description` | string | Description |
| `mimetype` | string | Content type |
| `parent` | string | Parent folder UUID |
| `owner` | string | Owner email |
| `createdTime` | string | ISO 8601 timestamp |
| `modifiedTime` | string | ISO 8601 timestamp |
| `size` | number | File size in bytes |
| `fulltext` | string | Extracted text (for `match`) |

### Array Fields

| Field | Type | Description |
|-------|------|-------------|
| `tags` | string[] | Categorization tags |
| `aspects` | string[] | Applied aspect UUIDs |
| `related` | string[] | Related node UUIDs |

### Common Mimetypes

| Mimetype | Description |
|----------|-------------|
| `application/pdf` | PDF document |
| `application/vnd.antbox.folder` | Folder |
| `application/vnd.antbox.smartfolder` | Smart folder |
| `application/vnd.antbox.metanode` | Business entity (metadata only) |
| `image/png`, `image/jpeg` | Images |
| `text/plain` | Text file |
