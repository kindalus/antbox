# Antbox Platform Context for LLMs

## 1. System Identity & Overview

**Antbox** is an API-first, modular **Enterprise Content Management (ECM)** platform built on the
**Deno** runtime. It is designed to be highly extensible through a "Everything is a Node"
philosophy.

**Primary Goal for LLMs:** When acting within or for Antbox, your goal is to generate valid
JSON/TypeScript artifacts (Nodes, Aspects, Features, Agents) that strictly adhere to the system's
domain model. You are an architect and developer for this platform.

### Core Architecture

- **Nodes**: The atomic unit of the system. Files, Folders, Users, Configuration, Scripts, and AI
  Agents are all Nodes.
- **Aspects**: A composition mechanism. Aspects allow you to attach custom, structured metadata
  schemas to any Node dynamically.
- **Features**: The logic layer. Features are executable JavaScript/TypeScript code stored as Nodes,
  allowing the system to be programmed from within itself.
- **AI Agents**: Autonomous actors stored as Nodes that can use Features (Tools) to interact with
  the system.

---

## 2. Artifact Reference & Schemas

### 2.0 Reference UUIDs

Antbox uses a few stable "UUID-like" string constants for system folders. When you see these
identifiers referenced in this document, use the literal values below.

| Reference               | Value           |
| ----------------------- | --------------- |
| `ROOT_FOLDER_UUID`      | `--root--`      |
| `SYSTEM_FOLDER_UUID`    | `--system--`    |
| `USERS_FOLDER_UUID`     | `--users--`     |
| `GROUPS_FOLDER_UUID`    | `--groups--`    |
| `ASPECTS_FOLDER_UUID`   | `--aspects--`   |
| `API_KEYS_FOLDER_UUID`  | `--api-keys--`  |
| `FEATURES_FOLDER_UUID`  | `--features--`  |
| `AGENTS_FOLDER_UUID`    | `--agents--`    |
| `WORKFLOWS_FOLDER_UUID` | `--workflows--` |

### 2.1 Base Node (The Atom)

All artifacts inherit from this structure.

```typescript
interface Node {
  uuid: string; // Unique ID (UUID v4). Auto-generated if missing.
  title: string; // Name of the node. Min 3 chars.
  description?: string; // Optional description.
  mimetype: string; // Discriminator for node type.
  parent: string; // UUID of parent folder. Root is 'ROOT_FOLDER_UUID'.
  owner: string; // Email of the owner (usually auto-filled).
  tags?: string[]; // Classification tags.
  createdTime?: string; // ISO Date. Read-only.
  modifiedTime?: string; // ISO Date. Read-only.
}
```

Note: Nodes do not have a generic `name` property. Use `title` for the display name and `uuid` as
the identifier.

### 2.2 Container: `FolderNode`

A folder that can contain other nodes, define access control, and enforce automation. **Mimetype:**
`application/vnd.antbox.folder`

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
**Mimetype:** `application/vnd.antbox.aspect` **Location:** Must be inside `ASPECTS_FOLDER_UUID`.
**Naming Convention:** Use **kebab-case** for `uuid` (e.g., `invoice-data`, `project-tracker`). The
`properties[].name` member will also typically be kebab-case.

**Best Practice: Aspect Composability** Aspects are designed to be small, orthogonal, and reusable
building blocks. They are _composable_, meaning multiple aspects can be applied to a single node. To
maintain this composability and avoid creating "monolithic" aspects, it is recommended to keep the
number of `properties` in an `AspectNode` **no greater than 5**. If more properties are needed,
consider splitting them into multiple, more focused aspects.

```typescript
interface AspectNode extends Node {
  // Node.uuid is the identifier for the aspect type (e.g., "invoice", "legal-review")
  properties: AspectProperty[];
}

interface AspectProperty {
  name: string; // (e.g., "invoice-date", "amount")
  title: string; // Human readable label
  type: "string" | "number" | "boolean" | "uuid" | "date" | "object" | "array";
  arrayType?: "string" | "number" | "uuid" | "object"; // Required if type is 'array'
  contentType?: string; // Only when type is "string" (e.g., "text/markdown", "text/html", "application/json")

  required?: boolean;
  default?: any;

  // Validation
  validationRegex?: string; // For string types
  validationList?: string[]; // Enum values for string types, it is recommended to used CamelCase ou SNAKE_CASE in capitals
}
```

**How aspect values are stored on a Node**

- `node.aspects` contains the list of applied Aspect UUIDs (e.g., `["invoice-data"]`).
- `node.properties` is a flat key/value map. Each aspect field is stored using the key format
  `${aspectUuid}:${propertyName}` (colon separator).
- Em termos práticos: os valores do aspecto ficam em `node.properties` usando a chave
  `${aspectUuid}:${propertyName}`.

```typescript
// Example: a node decorated with the "invoice-data" aspect
const nodeUpdate = {
  aspects: ["invoice-data"],
  properties: {
    "invoice-data:amount": 1000,
    "invoice-data:currency": "USD",
  },
};
```

### 2.4 Logic Unit: `FeatureNode`

Executable code. **Mimetype:** `application/vnd.antbox.feature` **Location:** Must be inside
`FEATURES_FOLDER_UUID`. **Naming Convention:** Use **camelCase** for `uuid` (e.g., `processInvoice`,
`summarizeDocument`).

A Feature can be one or more of the following:

1. **Action (`exposeAction`)**: Callable API operation. Can be triggered automatically by events
   (`runOnCreates`, etc.) or manually.
2. **AI Tool (`exposeAITool`)**: Exposed to `AgentNode`s as a tool.
3. **Extension (`exposeExtension`)**: Callable by external clients/UI.

```typescript
// The Node metadata structure for creating a FeatureNode
interface FeatureNodePayload extends Node {
  // The `title` is the feature's display name.

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
  title: string; // The feature's display name
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

  run(ctx: RunContext, args: FeatureRunArgs): Promise<unknown>;
}
```

#### Feature runtime types (`.d.ts`)

```typescript
// antbox-feature-runtime.d.ts

export type UUID = string;

export interface Principal {
  email: string;
  groups: string[];
}

export interface AuthenticationContext {
  tenant: string;
  principal: Principal;
  mode: "Direct" | "Action" | "AI";
}

export interface RunContext {
  authenticationContext: AuthenticationContext;
  nodeService: NodeServiceProxy;
}

export interface AntboxError {
  name: string;
  message: string;
}

export type Either<L, R> = Left<L, R> | Right<L, R>;

export interface Left<L, R> {
  value: L;
  isLeft(): this is Left<L, R>;
  isRight(): this is Right<L, R>;
}

export interface Right<L, R> {
  value: R;
  isLeft(): this is Left<L, R>;
  isRight(): this is Right<L, R>;
}

export type NodeFilter = [field: string, op: string, value: unknown];
export type NodeFilters = NodeFilter[] | NodeFilter[][];

export interface NodeFilterResult {
  pageToken: number;
  pageSize: number;
  nodes: NodeMetadata[];
  scores?: Record<string, number>;
}

export interface NodeMetadata {
  uuid: UUID;
  fid: string;
  title: string;
  description?: string;
  mimetype: string;
  parent: UUID;
  owner: string;
  createdTime: string;
  modifiedTime: string;
  size?: number;
  aspects?: UUID[];
  tags?: string[];
  related?: UUID[];
  properties?: Record<string, unknown>;
  locked?: boolean;
  lockedBy?: string;
  unlockAuthorizedGroups?: UUID[];
}

/**
 * NodeServiceProxy is what Features receive at runtime.
 *
 * It forwards every call to the real NodeService using the bound AuthenticationContext, so
 * user-authored code cannot supply arbitrary credentials.
 */
export interface NodeServiceProxy {
  get(uuid: UUID): Promise<Either<AntboxError, NodeMetadata>>;
  list(parent?: UUID): Promise<Either<AntboxError, NodeMetadata[]>>;
  find(
    filters: NodeFilters | string,
    pageSize?: number,
    pageToken?: number,
  ): Promise<Either<AntboxError, NodeFilterResult>>;
  breadcrumbs(
    uuid: UUID,
  ): Promise<Either<AntboxError, Array<{ uuid: UUID; title: string }>>>;

  create(
    metadata: Partial<NodeMetadata>,
  ): Promise<Either<AntboxError, NodeMetadata>>;
  createFile(
    file: File,
    metadata: Partial<NodeMetadata>,
  ): Promise<Either<AntboxError, NodeMetadata>>;

  update(
    uuid: UUID,
    metadata: Partial<NodeMetadata>,
  ): Promise<Either<AntboxError, void>>;
  updateFile(uuid: UUID, file: File): Promise<Either<AntboxError, void>>;
  delete(uuid: UUID): Promise<Either<AntboxError, void>>;
  export(uuid: UUID): Promise<Either<AntboxError, File>>;
  copy(uuid: UUID, parent: UUID): Promise<Either<AntboxError, NodeMetadata>>;
  duplicate(uuid: UUID): Promise<Either<AntboxError, NodeMetadata>>;
  lock(
    uuid: UUID,
    unlockAuthorizedGroups?: UUID[],
  ): Promise<Either<AntboxError, void>>;
  unlock(uuid: UUID): Promise<Either<AntboxError, void>>;
}

/**
 * Arguments passed to `run(ctx, args)`:
 * - Actions (manual/automatic): `{ uuids: string[], ... }` (uuids is the filtered target set)
 * - Extensions: parameters extracted from the HTTP request (GET query, POST JSON, or form-data)
 * - AI tools: parameters provided by the tool call
 */
export interface FeatureRunArgs extends Record<string, unknown> {
  /**
   * Present when executed as an Action (manual or automatic).
   * Contains the UUIDs of the nodes the action should apply to.
   */
  uuids?: UUID[];
}

export interface ActionRunArgs extends FeatureRunArgs {
  uuids: UUID[];
}
```

### 2.5 Intelligent Actor: `AgentNode`

An AI configuration that acts as a specialized assistant. **Mimetype:**
`application/vnd.antbox.agent` **Location:** Must be inside `AGENTS_FOLDER_UUID`.

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
- _Amount > 1000_: `['invoice-data:amount', '>', 1000]`

---

## 4. Examples & Implementation

### 4.1 Creating a "Legal Review" Aspect

**Scenario**: We need to track the status of legal contracts.

```typescript
// AspectNode Payload
const legalAspect = {
  uuid: "legal-review", // kebab-case
  title: "Legal Review Data",
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
      const nodeOrErr = await ctx.nodeService.get(uuid);
      if (nodeOrErr.isLeft()) continue;
      const node = nodeOrErr.value;

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

**Scenario**: A folder that only accepts image files and automatically applies a "with: images" tag
using a 'tag' action.

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

**Scenario**: A feature that logs a message to the console whenever a PDF document is created in the
platform.

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
