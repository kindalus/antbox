# Antbox Platform Context for LLMs

## 1. System Identity & Overview

**Antbox** is an API-first, modular **Enterprise Content Management (ECM)** platform built on the **Deno** runtime. It is designed to be highly extensible through a "Everything is a Node" philosophy.

**Primary Goal for LLMs:** When acting within or for Antbox, your goal is to generate valid JSON/TypeScript artifacts (Nodes, Aspects, Features, Agents) that strictly adhere to the system's domain model. You are an architect and developer for this platform.

### Core Architecture

- **Nodes**: The atomic unit of the system. Files, Folders, Users, Configuration, Scripts, and AI Agents are all Nodes.
- **Aspects**: A composition mechanism. Aspects allow you to attach custom, structured metadata schemas to any Node dynamically.
- **Features**: The logic layer. Features are executable JavaScript/TypeScript code stored as Nodes, allowing the system to be programmed from within itself.
- **AI Agents**: Autonomous actors stored as Nodes that can use Features (Tools) to interact with the system.

---

## 2. Artifact Reference & Schemas

### 2.1 Base Node (The Atom)

All artifacts inherit from this structure.

```typescript
interface Node {
  uuid: string;           // Unique ID (UUID v4). Auto-generated if missing.
  title: string;          // Name of the node. Min 3 chars.
  description?: string;   // Optional description.
  mimetype: string;       // Discriminator for node type.
  parent: string;         // UUID of parent folder. Root is 'Folders.ROOT_FOLDER_UUID'.
  owner: string;          // Email of the owner (usually auto-filled).
  tags?: string[];        // Classification tags.
  createdTime?: string;   // ISO Date. Read-only.
  modifiedTime?: string.  // ISO Date. Read-only.
}
```

### 2.2 Container: `FolderNode`

A folder that can contain other nodes, define access control, and enforce automation.
**Mimetype:** `application/vnd.antbox.folder`

```typescript
interface FolderNode extends Node {
  // Access Control
  permissions?: {
    group: ("Read" | "Write" | "Export")[]; // Permissions for the owner group
    authenticated: ("Read" | "Write" | "Export")[]; // Permissions for any logged-in user
    anonymous: ("Read" | "Write" | "Export")[]; // Public permissions
    advanced?: Record<string, Permission[]>; // Specific user/group permissions
  };

  // Automation Hooks (UUIDs of Workflows/Features)
  onCreate?: string[];
  onUpdate?: string[];
  onDelete?: string[];

  // Smart Folder Logic (accepts specific mimetypes, auto-tags, etc.)
  filters?: NodeFilter[];
}
```

### 2.3 Metadata Schema: `AspectNode`

Defines a custom data shape. Nodes can be "decorated" with this aspect to hold specific data.
**Mimetype:** `application/vnd.antbox.aspect`
**Location:** Must be inside `Folders.ASPECTS_FOLDER_UUID`.
**Naming Convention:** Use **kebab-case** for `uuid` (e.g., `invoice-data`, `project-tracker`). The
properties `name` member will also typically be kebab-case.

**Best Practice: Aspect Composability**
Aspects are designed to be small, orthogonal, and reusable building blocks. They are _composable_, meaning multiple aspects can be applied to a single node. To maintain this composability and avoid creating "monolithic" aspects, it is recommended to keep the number of `properties` in an `AspectNode` **no greater than 5**. If more properties are needed, consider splitting them into multiple, more focused aspects.

```typescript
interface AspectNode extends Node {
  uuid: string; // Internal identifier for the aspect type (e.g., "invoice", "legal-review")
  properties: AspectProperty[];
}

interface AspectProperty {
  name: string; // (e.g., "invoice-date", "amount")
  title: string; // Human readable label
  type: "string" | "number" | "boolean" | "uuid" | "date" | "object" | "array";
  arrayType?: "string" | "number" | "uuid" | "object"; // Required if type is 'array'

  required?: boolean;
  default?: any;

  // Validation
  validationRegex?: string; // For string types
  validationList?: string[]; // Enum values for string types, it is recommended to used CamelCase ou SNAKE_CASE in capitals
}
```

### 2.4 Logic Unit: `FeatureNode`

Executable code.
**Mimetype:** `application/vnd.antbox.feature`
**Location:** Must be inside `Folders.FEATURES_FOLDER_UUID`.
**Naming Convention:** Use **camelCase** for `uuid` (e.g., `processInvoice`, `summarizeDocument`).

A Feature can be one or more of the following:

1.  **Action (`exposeAction`)**: Callable API operation. Can be triggered automatically by events (`runOnCreates`, etc.) or manually.
2.  **AI Tool (`exposeAITool`)**: Exposed to `AgentNode`s as a tool.
3.  **Extension (`exposeExtension`)**: Callable by external clients/UI.

```typescript
// The Node metadata structure for creating a FeatureNode
interface FeatureNodePayload extends Node {
  // The 'title' of the Node serves as the 'name' of the Feature.
  // The internal 'Feature' object will use this 'title' as its 'name' property.

  // Configuration
  exposeAction: boolean;
  exposeExtension: boolean;
  exposeAITool: boolean;

  // Triggers (Only valid if exposeAction is true)
  runOnCreates: boolean;
  runOnUpdates: boolean;
  runOnDeletes: boolean;
  runManually: boolean;
  filters: NodeFilter[]; // Scope for triggers or availability

  // Security
  groupsAllowed: string[]; // Access control
  runAs?: string; // "system" or user email. Defaults to caller.

  // Interface Definition
  parameters: FeatureParameter[];
  returnType:
    | "string"
    | "number"
    | "boolean"
    | "array"
    | "object"
    | "file"
    | "void";
  returnContentType?: string; // Hint for client (e.g., "text/html", "application/json")
}

interface FeatureParameter {
  name: string;
  type: "string" | "number" | "boolean" | "object" | "array" | "file";
  arrayType?: "string" | "number" | "file" | "object";
  required: boolean;
  description?: string;
  defaultValue?: any;
}

// Full Feature Interface (Internal Representation of the executed code)
export interface Feature {
  uuid: string;
  name: string; // The effective name of the feature (from Node.title)
  description: string;

  exposeAction: boolean;
  exposeExtension: boolean;
  exposeAITool: boolean;

  runOnCreates: boolean;
  runOnUpdates: boolean;
  runOnDeletes: boolean;
  runManually: boolean;
  filters: NodeFilter[];

  groupsAllowed: string[];
  runAs?: string;

  parameters: FeatureParameter[];
  returnType:
    | "string"
    | "number"
    | "boolean"
    | "array"
    | "object"
    | "file"
    | "void";
  returnDescription?: string;
  returnContentType?: string;
  tags?: string[];

  run(ctx: RunContext, args: Record<string, unknown>): Promise<unknown>;
}
```

### 2.5 Intelligent Actor: `AgentNode`

An AI configuration that acts as a specialized assistant.
**Mimetype:** `application/vnd.antbox.agent`
**Location:** Must be inside `Folders.AGENTS_FOLDER_UUID`.

```typescript
interface AgentNode extends Node {
  model: string; // LLM Model ID (e.g., "gpt-4", "gemini-pro")
  temperature: number; // 0.0 to 2.0
  maxTokens: number; // Output limit

  reasoning: boolean; // Enable chain-of-thought/reasoning steps
  useTools: boolean; // Allow access to Features with exposeAITool: true

  systemInstructions: string; // The core prompt/persona of the agent
  structuredAnswer?: string; // Optional JSON schema for enforcing output format
}
```

---

## 3. Query Language: `NodeFilters`

Used to define scopes for Features, Smart Folders, and Searches.

**Format**: `[Field, Operator, Value]`

- **Simple (AND)**: `[[Filter1], [Filter2]]`
- **Complex (OR of ANDs)**: `[[FilterA, FilterB], [FilterC]]` -> `(A && B) || C`

**Operators**:

- `==`, `!=`: Equality
- `<`, `>`, `<=`, `>=`: Comparison
- `contains`: String substring or Array membership
- `in`, `not-in`: Value in list
- `match`: Regex match
- `~=`: Like (case-insensitive)

**Examples**:

- _File is a PDF_: `['mimetype', '==', 'application/pdf']`
- _Has 'Invoice' Aspect_: `['aspects', 'contains', 'invoice-data']`
- _Amount > 1000_: `['invoice-data.amount', '>', 1000]`

---

## 4. Examples & Implementation

### 4.1 Creating a "Legal Review" Aspect

**Scenario**: We need to track the status of legal contracts.

```typescript
// AspectNode Payload
const legalAspect = {
  uuid: "legal-review", // kebab-case
  title: "Legal Review Data",
  name: "legalReview", // Internal identifier for the aspect
  mimetype: "application/vnd.antbox.aspect",
  parent: "ASPECTS_FOLDER_UUID",
  properties: [
    {
      name: "status",
      title: "Review Status",
      type: "string",
      validationList: ["Draft", "Under Review", "Approved", "Rejected"],
      default: "Draft",
      required: true,
    },
    {
      name: "reviewer",
      title: "Assigned Attorney",
      type: "string", // Email
      validationRegex: "^[\\w-\\.]+@([\\w-]+\\.)+[\\w-]{2,4}$",
    },
    {
      name: "review-date",
      title: "Review Date",
      type: "date",
    },
  ],
};
```

### 4.2 Creating an "Analyze Contract" Feature (Action & AI Tool)

**Scenario**: A script that reads a PDF and extracts key clauses.

**File Content (`analyzeContract.js`)**:

```javascript
export default {
  uuid: "analyzeContract", // camelCase
  title: "Analyze Contract Clauses", // This will be the feature's name
  description:
    "Extracts liability and termination clauses from legal documents.",

  // Exposed as Action (for UI buttons) and AI Tool (for Agents)
  exposeAction: true,
  exposeAITool: true,
  exposeExtension: false,

  // Available only for PDFs
  filters: [["mimetype", "==", "application/pdf"]],

  // Manual trigger only
  runManually: true,
  runOnCreates: false,
  runOnUpdates: false,

  parameters: [
    {
      name: "uuids",
      type: "array",
      arrayType: "string",
      required: true,
      description: "List of contract Node UUIDs",
    },
  ],

  returnType: "object",

  run: async (ctx, args) => {
    const results = {};

    for (const uuid of args.uuids) {
      const node = await ctx.nodeService.get(uuid);
      if (node.isLeft()) continue;

      // Pseudo-code: In a real scenario, this might call an LLM service or OCR
      // ctx provides services like: ctx.llm, ctx.storage, etc.
      results[uuid] = {
        liabilityClause: "Found on page 3...",
        terminationClause: "Found on page 9...",
      };
    }

    return results;
  },
};
```

### 4.3 Creating a "Legal Assistant" Agent

**Scenario**: An AI agent that uses the tool above to help users.

```typescript
// AgentNode Payload
const legalAgent = {
  title: "Legal Assistant",
  mimetype: "application/vnd.antbox.agent",
  parent: "AGENTS_FOLDER_UUID",

  model: "gpt-4-turbo",
  temperature: 0.2, // Low temperature for precision
  maxTokens: 4000,

  reasoning: true, // Enable step-by-step thinking
  useTools: true, // Allow it to call "analyzeContract"

  systemInstructions: `
    You are a senior legal assistant. 
    Your goal is to help users understand contract risks.
    
    Guidelines:
    1. Always use the 'Analyze Contract Clauses' tool when a user uploads a PDF.
    2. Summarize the 'liabilityClause' in plain English.
    3. Flag any termination notice periods shorter than 30 days.
    
    Do not provide legal advice, only information.
  `,
};
```

### 4.4 Creating a "Node Report" Extension (HTML Output)

**Scenario**: Render a custom HTML table of node properties for the UI.

**File Content (`nodeReport.js`)**:

```javascript
export default {
  uuid: "nodeReport",
  title: "Node Report", // This will be the feature's name
  description: "Generates an HTML table of node properties",

  exposeAction: false,
  exposeAITool: false,
  exposeExtension: true, // Exposed as extension

  filters: [], // Available for all nodes

  parameters: [
    {
      name: "uuid",
      type: "string",
      required: true,
      description: "The UUID of the node",
    },
  ],

  returnType: "string",
  returnContentType: "text/html", // Hint for client rendering

  run: async (ctx, args) => {
    const nodeResult = await ctx.nodeService.get(args.uuid);
    if (nodeResult.isLeft()) return "<h1>Node not found</h1>";
    const node = nodeResult.value;

    return `
      <div class="report">
        <h2>${node.title}</h2>
        <table>
          <tr><td>UUID</td><td>${node.uuid}</td></tr>
          <tr><td>Type</td><td>${node.mimetype}</td></tr>
          <tr><td>Size</td><td>${node.size || "N/A"}</td></tr>
        </table>
      </div>
    `;
  },
};
```

### 4.5 Folder for Images with Auto-Tagging

**Scenario**: A folder that only accepts image files and automatically applies a "with: images" tag using a 'tag' action.

```typescript
// FolderNode Payload
const imageFolder = {
  title: "My Image Folder",
  mimetype: "application/vnd.antbox.folder",
  parent: "ROOT_FOLDER_UUID", // Or any parent folder UUID

  filters: [
    ["mimetype", "contains", "image/"], // Only accept image mimetypes
  ],

  onCreate: [
    // Assuming a 'tag' feature exists (uuid: 'tagNode')
    // This action would take the created node's UUID and add a tag.
    "tagNode",
  ],

  // Custom metadata for the 'tag' action on create
  // This demonstrates how onCreate actions can receive additional context
  onCreateConfig: {
    tagNode: {
      tag: "with: images",
    },
  },
};
```

### 4.6 Automatic PDF Console Logging Action

**Scenario**: A feature that logs a message to the console whenever a PDF document is created in the platform.

**File Content (`logPdfCreation.js`)**:

```javascript
export default {
  uuid: "logPdfCreation", // camelCase
  title: "Log PDF Creation", // This will be the feature's name
  description: "Logs to console when a PDF is created",

  exposeAction: true, // Needs to be an action to use 'runOnCreates'
  exposeAITool: false,
  exposeExtension: false,

  runManually: false, // Not meant for manual execution
  runOnCreates: true, // Trigger on node creation
  runOnUpdates: false,
  runOnDeletes: false,

  filters: [
    ["mimetype", "==", "application/pdf"], // Only trigger for PDFs
  ],

  parameters: [
    {
      name: "uuids",
      type: "array",
      arrayType: "string",
      required: true,
      description: "UUIDs of created PDFs",
    },
  ],

  returnType: "void",

  run: async (ctx, args) => {
    for (const uuid of args.uuids) {
      const nodeResult = await ctx.nodeService.get(uuid);
      if (nodeResult.isLeft()) {
        console.error(`Failed to get node ${uuid} for logging.`);
        continue;
      }
      const node = nodeResult.value;
      console.log(
        `[AUTOMATED ACTION] New PDF created: "${node.title}" (UUID: ${uuid})`,
      );
    }
  },
};
```
