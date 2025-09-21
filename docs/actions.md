# Features, Actions & Extensions in Antbox ECM

Antbox ECM is built around a **feature-centric architecture** where **Features** serve as the core building blocks for dynamic functionality. Features are JavaScript/TypeScript functions that can be exposed in multiple ways to provide automation, custom endpoints, and AI integration capabilities.

## Core Concept: Features

A **Feature** in Antbox is a JavaScript module that encapsulates specific functionality. Features can be exposed as:

- **Actions**: Automated behaviors triggered by node operations
- **Extensions**: HTTP-accessible endpoints for custom functionality
- **MCP Tools**: Model Context Protocol compatible tools for AI integration

This unified approach allows you to write functionality once and expose it in multiple ways based on your needs.

## Feature Structure

### Basic Feature Definition

```typescript
// example-feature.ts
export default async function (
  context: FeatureContext,
  params: Record<string, unknown>,
) {
  const { nodeService, request, user } = context;

  // Your custom logic here
  const nodes = await nodeService.find({
    filters: [{ property: "mimetype", value: "text/plain" }],
  });

  return {
    processed: nodes.length,
    message: "Feature executed successfully",
  };
}
```

### Feature Metadata

Features include metadata that defines how they can be used:

```typescript
interface FeatureNode {
  uuid: string;
  name: string;
  title: string;
  description: string;
  parameters: FeatureParameter[];

  // Exposure configuration
  runOnCreates: boolean; // Can be triggered on node creation
  runOnUpdates: boolean; // Can be triggered on node updates
  runManually: boolean; // Can be executed manually
  runAs?: string; // Execute as specific user

  // Filtering - Uses NodeFilter system for precise targeting
  filters: NodeFilters; // When this feature applies (see NodeFilter documentation)
  groupsAllowed: string[]; // Which groups can execute
}
```

### Feature Parameters

Features can define typed parameters for validation and documentation:

```typescript
interface FeatureParameter {
  name: string;
  type: "string" | "number" | "boolean" | "object" | "array" | "file";
  arrayType?: "string" | "number" | "file" | "object";
  contentType?: string;
  required: boolean;
  description?: string;
  defaultValue?: any;
}
```

### NodeFilter Integration

Features use the powerful **NodeFilter** system to determine when they should be executed. This allows for sophisticated targeting based on node properties, metadata, and aspects:

```typescript
// Action that applies only to PDF files larger than 1MB
{
  filters: [
    ["mimetype", "==", "application/pdf"],
    ["size", ">", 1048576],
  ];
}

// Action for urgent documents in specific folders
{
  filters: [
    [["tags", "contains", "urgent"]],
    [["parent", "==", "reports-folder-uuid"]],
  ];
}

// Complex aspect-based targeting
{
  filters: [
    ["aspects.document.category", "==", "contract"],
    ["aspects.document.status", "!=", "archived"],
  ];
}
```

**Key NodeFilter capabilities for Actions:**

- **Field access**: Query any node property using dot notation
- **Operator support**: Equality, comparison, array operations, text matching
- **Complex logic**: AND/OR combinations for precise targeting
- **Aspect integration**: Filter based on custom aspect properties
- **Performance**: Efficient evaluation across large node collections

## Features as Actions

When exposed as **Actions**, features provide automated behaviors that execute based on node lifecycle events or manual triggers.

### Action Triggers

- **onCreate**: Executes when a node matching the filters is created
- **onUpdate**: Executes when a matching node is updated
- **Manual**: Executes when explicitly triggered via API

### Built-in Actions

Antbox includes several built-in actions:

- `copy_to_folder`: Copy nodes to a specific folder
- `move_to_folder`: Move nodes to a specific folder
- `move_up`: Move nodes up in hierarchy
- `delete_all`: Bulk delete operations

### Action Execution Context

```typescript
interface ActionContext {
  nodeService: NodeService;
  user: User;
  tenant: string;
  uuids: string[]; // Target node UUIDs
  additionalParams?: any; // Extra parameters
}
```

### Example Action Feature

```typescript
// auto-tag-documents.ts
export default async function (context: ActionContext, params: any) {
  const { nodeService, uuids } = context;

  for (const uuid of uuids) {
    const node = await nodeService.get(uuid);

    if (node.mimetype === "application/pdf") {
      // Add automatic tags based on content analysis
      await nodeService.update(uuid, {
        tags: ["document", "pdf", "auto-tagged"],
      });
    }
  }

  return { tagged: uuids.length };
}
```

## Features as Extensions

When exposed as **Extensions**, features become HTTP endpoints that can be accessed directly via REST API.

### Extension Endpoints

Extensions are accessible at: `GET/POST /ext/{feature-uuid}`

### Extension Context

```typescript
interface ExtensionContext {
  nodeService: NodeService;
  request: Request; // HTTP request object
  user: User;
  tenant: string;
}
```

### Example Extension Feature

```typescript
// report-generator.ts
export default async function (context: ExtensionContext, params: any) {
  const { nodeService, request } = context;

  // Generate custom report
  const nodes = await nodeService.find({
    filters: [
      { property: "createdTime", operator: ">=", value: params.startDate },
    ],
  });

  const html = `
    <html>
      <head><title>Content Report</title></head>
      <body>
        <h1>Content Report</h1>
        <p>Total nodes: ${nodes.length}</p>
        <ul>
          ${nodes.map((n) => `<li>${n.title}</li>`).join("")}
        </ul>
      </body>
    </html>
  `;

  return new Response(html, {
    headers: { "content-type": "text/html" },
  });
}
```

## Features as MCP Tools

Features can be exposed as **Model Context Protocol (MCP) Tools** for AI integration.

### MCP Integration

MCP Tools allow AI models to interact with Antbox content programmatically:

```typescript
// search-content.ts
export default async function (context: MCPContext, params: any) {
  const { nodeService } = context;

  const results = await nodeService.find({
    filters: [
      { property: "fulltext", operator: "contains", value: params.query },
    ],
  });

  return {
    results: results.map((node) => ({
      uuid: node.uuid,
      title: node.title,
      excerpt: node.description,
    })),
  };
}
```

## Feature Management

### Creating Features

Features are created as nodes with specific metadata:

```typescript
const feature = await nodeService.create({
  mimetype: "application/vnd.antbox.feature",
  parent: Folders.FEATURES_FOLDER_UUID,
  name: "my-feature",
  title: "My Custom Feature",
  description: "Performs custom processing",
  parameters: [
    {
      name: "query",
      type: "string",
      required: true,
      description: "Search query",
    },
  ],
  runManually: true,
  filters: [],
});
```

### Feature Execution

Features can be executed through various APIs:

```bash
# As Action
GET /features/{uuid}/-/run-action?uuids=uuid1,uuid2

# As Extension
GET /ext/{uuid}?param1=value1

# Via Features API
GET /features/{uuid}/-/run?type=action&uuids=uuid1
```

## Security & Permissions

### Access Control

- **Group Restrictions**: `groupsAllowed` controls which groups can execute
- **User Context**: Features run with appropriate user permissions
- **Tenant Isolation**: Features respect multi-tenant boundaries

### Sandboxed Execution

Features run in a controlled environment with:

- Limited system access
- Controlled API surface
- Resource monitoring
- Timeout protection

## Advanced Features

### Content Processing

```typescript
// text-processor.ts
export default async function (context: ActionContext) {
  const { nodeService, uuids } = context;

  for (const uuid of uuids) {
    const node = await nodeService.get(uuid);

    if (node.mimetype === "text/plain") {
      const content = await nodeService.getContent(uuid);
      const wordCount = content.toString().split(/\s+/).length;

      await nodeService.update(uuid, {
        wordCount: wordCount,
        processed: true,
      });
    }
  }
}
```

### External Integration

```typescript
// webhook-notifier.ts
export default async function (context: ActionContext, params: any) {
  const { nodeService, uuids } = context;

  for (const uuid of uuids) {
    const node = await nodeService.get(uuid);

    await fetch(params.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "node_created",
        node: {
          uuid: node.uuid,
          title: node.title,
          mimetype: node.mimetype,
        },
      }),
    });
  }
}
```

## Best Practices

1. **Single Responsibility**: Each feature should have a focused purpose
2. **Error Handling**: Always handle errors gracefully and return meaningful messages
3. **Performance**: Consider the impact on system performance, especially for onCreate/onUpdate actions
4. **Security**: Validate all inputs and respect user permissions
5. **Documentation**: Provide clear descriptions and parameter documentation

## Conclusion

The feature-centric architecture of Antbox ECM provides unprecedented flexibility in content management and automation. By creating features once and exposing them as actions, extensions, or MCP tools, you can build powerful, reusable functionality that adapts to different use cases and integration requirements.

Whether you need automated content processing, custom HTTP endpoints, or AI-powered tools, features provide the foundation for extending Antbox to meet your specific needs.
