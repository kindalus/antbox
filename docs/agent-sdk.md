# Agent SDK

The Agent SDK provides AI agents with programmatic access to the Antbox platform. Agents interact with the platform exclusively through code execution, using SDK instances that are injected into the code runtime.

## Overview

When an AI agent needs to interact with Antbox data, it writes JavaScript code that is executed server-side via the `runCode` tool. The code receives SDK instances that provide methods for querying and manipulating nodes, aspects, and custom features.

### Code Execution Pattern

All agent code follows this structure:

```javascript
export default async function({ nodes, aspects, custom }) {
  // Your code here using SDK methods
  // Always return JSON.stringify() for results
}
```

The function receives three SDK instances:
- **nodes** - NodeServiceProxy for node operations
- **aspects** - AspectServiceProxy for aspect operations  
- **custom** - Custom features exposed as AI tools

### Progressive Loading Strategy

SDKs follow a progressive loading strategy similar to skills:

| Level | Content | When Loaded | Purpose |
|-------|---------|-------------|---------|
| **Level 1** | SDK names and method listings | At agent startup | Discovery - agents know what's available |
| **Level 2** | Full TypeScript interface documentation | On-demand via `loadSdkDocumentation` | Detailed method signatures and types |

This approach keeps the system prompt lightweight while giving agents access to detailed documentation when needed.

## Available SDKs

### nodes SDK

The `nodes` SDK provides methods for managing nodes in Antbox. Nodes are the fundamental data structure representing documents, folders, and business entities.

**Available methods:**
- `copy` - Copy a node to a new location
- `create` - Create a new node (folder, meta node, etc.)
- `createFile` - Create a file node with content
- `delete` - Delete a node
- `duplicate` - Duplicate a node in the same parent
- `export` - Export a node's content
- `evaluate` - Evaluate a smart folder or feature
- `find` - Search for nodes using filters
- `get` - Retrieve a single node by UUID
- `list` - List children of a parent node
- `breadcrumbs` - Get the path from root to a node
- `update` - Update node metadata
- `updateFile` - Update a file node's content
- `lock` - Lock a node for editing
- `unlock` - Unlock a locked node

### aspects SDK

The `aspects` SDK provides methods for working with aspect definitions. Aspects define metadata schemas that can be applied to nodes.

**Available methods:**
- `get` - Retrieve an aspect definition by UUID
- `listAspects` - List all available aspects

### custom SDK

The `custom` SDK provides access to user-defined features that are exposed as AI tools. The available methods depend on which features have been configured with `exposeAITool: true`.

## Error Handling

All SDK methods return an `Either` type for explicit error handling:

```javascript
const result = await nodes.get(uuid);

if (result.isLeft()) {
  // Error occurred
  return JSON.stringify({ 
    error: true, 
    message: result.value.message 
  });
}

// Success - access the value
const node = result.value;
```

The `Either` type has two methods:
- `isLeft()` - Returns `true` if the operation failed
- `isRight()` - Returns `true` if the operation succeeded
- `value` - Contains either the error (if left) or the result (if right)

## Loading SDK Documentation

Agents can load detailed SDK documentation using the `loadSdkDocumentation` tool:

```javascript
// Load nodes SDK documentation
loadSdkDocumentation("nodes")

// Load aspects SDK documentation
loadSdkDocumentation("aspects")

// Load custom features documentation
loadSdkDocumentation("custom")
```

The documentation is returned in TypeScript declaration format, providing:
- Method signatures with parameter types
- Return types
- JSDoc descriptions
- Supporting type definitions

## Code Best Practices

### 1. Focus on Data Retrieval

Code should retrieve data; analysis happens outside code:

```javascript
// GOOD - Return raw data for analysis
export default async function({ nodes, aspects }) {
  const result = await nodes.find([
    ["aspects", "contains", "invoice-uuid"]
  ]);
  
  if (result.isLeft()) {
    return JSON.stringify({ error: result.value.message });
  }
  
  return JSON.stringify({ nodes: result.value.nodes });
}
```

```javascript
// BAD - Don't analyze or interpret in code
export default async function({ nodes }) {
  const result = await nodes.find([...]);
  // Don't do this - let the agent analyze outside code
  const openInvoices = result.value.nodes.filter(n => n.properties["invoice:status"] === "open");
  const total = openInvoices.reduce((sum, n) => sum + n.properties["invoice:amount"], 0);
  return JSON.stringify({ count: openInvoices.length, total });
}
```

### 2. Always Handle Errors

Check `isLeft()` before accessing values:

```javascript
export default async function({ nodes }) {
  const result = await nodes.get("some-uuid");
  
  if (result.isLeft()) {
    return JSON.stringify({ 
      error: true, 
      message: result.value.message 
    });
  }
  
  return JSON.stringify({ node: result.value });
}
```

### 3. Return JSON

Always return `JSON.stringify()` results:

```javascript
export default async function({ aspects }) {
  const allAspects = await aspects.listAspects();
  return JSON.stringify({ aspects: allAspects });
}
```

### 4. Use Filters Effectively

The `find` method accepts powerful filter expressions:

```javascript
// AND logic - all conditions must match
const result = await nodes.find([
  ["mimetype", "==", "application/pdf"],
  ["size", ">", 1000000],
  ["tags", "contains", "important"]
]);

// OR logic - any condition group can match
const result = await nodes.find([
  [["status", "==", "open"]],
  [["status", "==", "pending"]]
]);
```

## Node Filters Reference

Filters are the primary query mechanism. A filter is a tuple: `[field, operator, value]`

### Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `==` | Exact equality | `["mimetype", "==", "application/pdf"]` |
| `!=` | Not equal | `["status", "!=", "deleted"]` |
| `<`, `<=`, `>`, `>=` | Numeric/date comparison | `["size", ">", 1000000]` |
| `match` | Full-text search | `["fulltext", "match", "contract"]` |
| `in` | Value in array | `["status", "in", ["open", "pending"]]` |
| `not-in` | Value not in array | `["status", "not-in", ["closed", "cancelled"]]` |
| `contains` | Array contains value | `["tags", "contains", "urgent"]` |
| `contains-all` | Array contains all values | `["aspects", "contains-all", ["aspect1", "aspect2"]]` |
| `contains-any` | Array contains any value | `["tags", "contains-any", ["urgent", "priority"]]` |
| `not-contains` | Array doesn't contain value | `["tags", "not-contains", "archived"]` |
| `contains-none` | Array contains none of values | `["tags", "contains-none", ["deleted", "spam"]]` |

### Common Query Patterns

```javascript
// Find all nodes with a specific aspect
await nodes.find([["aspects", "contains", "customer-aspect-uuid"]])

// Find by aspect property
await nodes.find([
  ["aspects", "contains", "invoice-aspect-uuid"],
  ["invoice-aspect-uuid:status", "==", "open"]
])

// Find by date range
await nodes.find([
  ["createdTime", ">=", "2024-01-01T00:00:00Z"],
  ["createdTime", "<", "2024-02-01T00:00:00Z"]
])

// Full-text search
await nodes.find([["fulltext", "match", "contract terms"]])

// Semantic search (string query)
await nodes.find("?contract terms")
```

## Integration with Skills

Skills can provide domain-specific guidance for SDK usage. When an agent has access to skills, it can:

1. Load skill instructions that explain how to use SDKs for specific tasks
2. Follow skill-provided patterns for common operations
3. Use skill resources for reference documentation

Skills are loaded after the SDK system prompt, allowing skills to build upon and enhance SDK capabilities.

## Security Model

SDK methods respect the authentication context of the current user:

- **Permission checks**: All operations are validated against node permissions
- **Group filtering**: Results are filtered based on user's group memberships
- **No privilege escalation**: The proxy pattern prevents code from using different credentials

The `NodeServiceProxy` and `AspectServiceProxy` classes bind the authentication context, ensuring user-authored code cannot bypass security controls.
