# Antbox Platform Context for LLMs

## 1. System Identity & Overview

**Antbox** is an API-first, modular **Enterprise Content Management (ECM)** platform built on the **Deno** runtime. It manages content through Nodes while keeping system configuration separate for clean separation of concerns.

**Primary Goal for LLMs:** When acting within or for Antbox, your goal is to help users manage content (Nodes), understand business data (Aspects), and leverage AI capabilities (Agents, Skills). You can execute code, query data, and interact with the platform through well-defined SDKs.

### Core Architecture

Antbox separates **content** from **configuration**:

| Layer             | Storage                 | Examples                                                    |
| ----------------- | ----------------------- | ----------------------------------------------------------- |
| **Content**       | NodeRepository          | Files, Folders, Smart Folders, Meta Nodes, Articles         |
| **Configuration** | ConfigurationRepository | Agents, Features, Aspects, Workflows, Users, Groups, Skills |

**Key Concepts:**

- **Nodes**: The atomic unit for content. Files, folders, and business entities are all nodes.
- **Aspects**: Metadata schemas that transform generic nodes into structured business entities.
- **Features**: Executable JavaScript/TypeScript code that extends platform capabilities.
- **Agents**: AI configurations that can interact with the system using SDKs and Skills.
- **Skills**: Modular, markdown-based instructions that extend agent capabilities.

---

## 2. Nodes (Content Layer)

Nodes are the fundamental content unit in Antbox.

### 2.1 Node Structure

```typescript
interface NodeMetadata {
  uuid: string; // Unique identifier (UUID v4)
  fid: string; // Friendly ID (human-readable slug)
  title: string; // Display name (min 3 chars)
  description?: string; // Optional description
  mimetype: string; // Content type discriminator
  parent: string; // Parent folder UUID
  owner: string; // Owner email
  tags?: string[]; // Classification tags
  aspects?: string[]; // Applied aspect UUIDs
  properties?: Record<string, unknown>; // Aspect property values
  createdTime: string; // ISO 8601 timestamp (read-only)
  modifiedTime: string; // ISO 8601 timestamp (read-only)
  size?: number; // File size in bytes
  locked?: boolean; // Lock status
  lockedBy?: string; // Who locked it
}
```

### 2.2 Node Types

| Mimetype                             | Type         | Description                              |
| ------------------------------------ | ------------ | ---------------------------------------- |
| `application/vnd.antbox.folder`      | Folder       | Container for other nodes                |
| `application/vnd.antbox.smartfolder` | Smart Folder | Dynamic folder based on filters          |
| `application/vnd.antbox.metanode`    | Meta Node    | Business entity (metadata only, no file) |
| `application/vnd.antbox.article`     | Article      | Rich text content                        |
| `application/pdf`, `image/*`, etc.   | File         | Binary content with metadata             |

### 2.3 System Folder UUIDs

| Reference            | Value        | Purpose                     |
| -------------------- | ------------ | --------------------------- |
| `ROOT_FOLDER_UUID`   | `--root--`   | Root of the content tree    |
| `SYSTEM_FOLDER_UUID` | `--system--` | System configuration folder |

### 2.4 Folder Features

Folders can define:

```typescript
interface FolderNode extends NodeMetadata {
  permissions?: {
    group: Permission[]; // Owner group permissions
    authenticated: Permission[]; // Logged-in user permissions
    anonymous: Permission[]; // Public permissions
    advanced?: Record<string, Permission[]>; // Specific user/group
  };

  // Automation triggers (Feature UUIDs)
  onCreate?: string[];
  onUpdate?: string[];
  onDelete?: string[];

  // Smart folder filtering
  filters?: NodeFilter[];
}

type Permission = "Read" | "Write" | "Export";
```

---

## 3. Aspects (Metadata Schemas)

Aspects define custom metadata schemas that can be attached to any node, transforming generic content into structured business entities.

### 3.1 Aspect Structure

```typescript
interface AspectData {
  uuid: string; // kebab-case identifier
  title: string; // Display name
  description?: string;
  filters: NodeFilters; // Optional: which nodes can have this aspect
  properties: AspectProperty[]; // Schema definition
  createdTime: string;
  modifiedTime: string;
}

interface AspectProperty {
  name: string; // Property identifier
  title: string; // Display label
  type: "string" | "number" | "boolean" | "uuid" | "object" | "array" | "file";
  arrayType?: "string" | "number" | "uuid";
  contentType?: string; // For strings: "text/markdown", "text/html", etc.
  readonly?: boolean;
  searchable?: boolean;
  required?: boolean;
  defaultValue?: string | number | boolean;
  validationRegex?: string; // Regex pattern for strings
  validationList?: string[]; // Enum values
  validationFilters?: NodeFilters; // For uuid type: valid reference targets
}
```

### 3.2 How Aspects Attach to Nodes

When an aspect is applied to a node:

1. The aspect UUID is added to `node.aspects[]`
2. Property values are stored in `node.properties{}` using the format: `${aspectUuid}:${propertyName}`

**Example:**

```json
{
  "uuid": "doc-123",
  "title": "Invoice #2024-001",
  "mimetype": "application/pdf",
  "aspects": ["invoice"],
  "properties": {
    "invoice:amount": 1500.0,
    "invoice:currency": "EUR",
    "invoice:status": "Pending",
    "invoice:customerId": "customer-456"
  }
}
```

### 3.3 Best Practices

- Use **kebab-case** for aspect UUIDs: `invoice-data`, `legal-review`
- Keep aspects **small and composable** (≤5 properties recommended)
- Multiple aspects can be applied to a single node
- Use `uuid` type for cross-node references

---

## 4. Features (Executable Code)

Features are JavaScript/TypeScript modules that extend platform capabilities.

### 4.1 Feature Structure

```typescript
interface FeatureData {
  uuid: string; // camelCase identifier
  title: string; // Display name
  description: string;

  // Exposure modes
  exposeAction: boolean; // Callable as action on nodes
  exposeExtension: boolean; // Custom HTTP endpoint
  exposeAITool: boolean; // Available to AI agents

  // Automatic triggers (requires exposeAction: true)
  runOnCreates: boolean;
  runOnUpdates: boolean;
  runOnDeletes: boolean;
  runManually: boolean;

  // Scope and security
  filters: NodeFilter[]; // Which nodes this applies to
  groupsAllowed: string[]; // Access control
  runAs?: string; // "system" or user email

  // Interface
  parameters: FeatureParameter[];
  returnType:
    | "string"
    | "number"
    | "boolean"
    | "array"
    | "object"
    | "file"
    | "void";
  returnContentType?: string; // e.g., "text/html", "application/json"

  module: string; // The actual code
  createdTime: string;
  modifiedTime: string;
}
```

### 4.2 Feature Module Format

```javascript
export default {
  uuid: "processInvoice",
  title: "Process Invoice",
  description: "Extracts data from invoice PDFs",

  exposeAction: true,
  exposeAITool: true,
  exposeExtension: false,

  runManually: true,
  runOnCreates: false,
  runOnUpdates: false,
  runOnDeletes: false,

  filters: [["mimetype", "==", "application/pdf"]],
  groupsAllowed: ["--admins--"],

  parameters: [
    { name: "uuids", type: "array", arrayType: "string", required: true },
  ],
  returnType: "object",

  async run(ctx, args) {
    // ctx.authenticationContext - who is running this
    // ctx.nodeService - NodeServiceProxy for content operations
    // args.uuids - target nodes (for actions)

    const results = {};
    for (const uuid of args.uuids) {
      const nodeOrErr = await ctx.nodeService.get(uuid);
      if (nodeOrErr.isLeft()) continue;

      results[uuid] = { processed: true };
    }
    return results;
  },
};
```

### 4.3 Execution Contexts

| Mode          | Trigger                    | Args                             |
| ------------- | -------------------------- | -------------------------------- |
| **Action**    | Manual button or automatic | `{ uuids: string[], ...params }` |
| **Extension** | HTTP request               | Parameters from query/body       |
| **AI Tool**   | Agent tool call            | Parameters from LLM              |

---

## 5. AI Agents

Agents are AI configurations that can interact with the platform using SDKs, Skills, and Features.

### 5.1 Agent Structure

```typescript
interface AgentData {
  uuid: string;
  title: string;
  description?: string;
  model: string; // "default" or specific model name
  temperature: number; // 0.0 - 2.0
  maxTokens: number;
  reasoning: boolean; // Enable chain-of-thought
  useTools: boolean; // Enable SDK access
  useSkills: boolean; // Enable skill loading
  skillsAllowed?: string[]; // Optional: restrict to specific skills
  systemInstructions: string; // Core prompt/persona
  createdTime: string;
  modifiedTime: string;
}
```

### 5.2 Agent Capabilities

When `useTools: true`, agents have access to:

**Nodes SDK** (15 methods):

- `get(uuid)` - Get node metadata
- `list(parent?)` - List children of a folder
- `find(filters, pageSize?, pageToken?)` - Search nodes
- `create(metadata)` - Create meta node
- `createFile(file, metadata)` - Create file node
- `update(uuid, metadata)` - Update node
- `updateFile(uuid, file)` - Replace file content
- `delete(uuid)` - Delete node
- `export(uuid)` - Download file
- `copy(uuid, parent)` - Copy to folder
- `duplicate(uuid)` - Duplicate in place
- `lock(uuid)` / `unlock(uuid)` - Lock management
- `breadcrumbs(uuid)` - Get path to root
- `evaluate(uuid)` - Run evaluator

**Aspects SDK** (2 methods):

- `get(uuid)` - Get aspect definition
- `listAspects()` - List all aspects

**Custom Features**:
Any feature with `exposeAITool: true` becomes available as a tool.

### 5.3 Agent Execution Modes

| Mode       | Method                                      | Use Case                |
| ---------- | ------------------------------------------- | ----------------------- |
| **Chat**   | `chat(agentUuid, message, history, files?)` | Multi-turn conversation |
| **Answer** | `answer(agentUuid, question, files?)`       | One-shot Q&A            |

Both modes support tool calling - the agent can invoke tools multiple times before responding.

---

## 6. Skills System

Skills are modular, markdown-based instructions that extend agent capabilities with domain-specific expertise.

### 6.1 Skill Structure

```typescript
interface AgentSkillData {
  uuid: string; // kebab-case skill name
  title: string; // Title Case
  description: string; // Brief description for discovery
  content: string; // Full markdown content
  createdTime: string;
  modifiedTime: string;
}
```

### 6.2 Progressive Loading Strategy

Skills use a three-level loading approach to minimize context usage:

| Level       | Content                              | When Loaded          | Token Limit   |
| ----------- | ------------------------------------ | -------------------- | ------------- |
| **Level 1** | YAML frontmatter (name, description) | Agent startup        | <100 tokens   |
| **Level 2** | H1 heading + first H2 section        | When skill triggered | <5,000 tokens |
| **Level 3** | Remaining H2 sections                | On-demand            | Unlimited     |

### 6.3 Skill Markdown Format

````markdown
---
name: pdf-processing
description: Extract text, fill forms, merge PDF documents. Use when working with PDFs.
---

# PDF Processing

## Quick Start

Core instructions loaded when skill is triggered...

```python
import pdfplumber
with pdfplumber.open("doc.pdf") as pdf:
    text = pdf.pages[0].extract_text()
```
````

For form filling, see [Form Filling](#form-filling).

## Form Filling

Extended resource loaded on-demand...

## Reference

Additional resources...

````

### 6.4 Loading Skills Programmatically

Agents load skills using the `loadSkill` tool:

```typescript
loadSkill(skillName: string, ...resources: string[]): Promise<string>
````

**Examples:**

- `loadSkill("pdf-processing")` → Level 2 only
- `loadSkill("pdf-processing", "form-filling")` → Level 2 + Form Filling section
- `loadSkill("pdf-processing", "form-filling", "reference")` → Level 2 + multiple sections

### 6.5 Skill Access Control

- `useSkills: false` → No skills available
- `useSkills: true, skillsAllowed: undefined` → All skills available
- `useSkills: true, skillsAllowed: ["querying", "pdf-processing"]` → Only listed skills

---

## 7. Query Language: NodeFilters

Used for searching nodes, defining smart folder criteria, and scoping features.

### 7.1 Filter Format

A filter is a tuple: `[field, operator, value]`

**Simple (AND logic):**

```javascript
[
  ["mimetype", "==", "application/pdf"],
  ["size", ">", 1000000],
];
// Matches: PDFs larger than 1MB
```

**Complex (OR of ANDs):**

```javascript
[
  [
    ["mimetype", "==", "application/pdf"],
    ["size", ">", 5000000],
  ],
  [
    ["mimetype", "contains", "image/"],
    ["tags", "contains", "important"],
  ],
];
// Matches: (Large PDFs) OR (Important images)
```

### 7.2 Operators

| Operator             | Description                   | Example                                   |
| -------------------- | ----------------------------- | ----------------------------------------- |
| `==`                 | Exact equality                | `["title", "==", "Invoice #001"]`         |
| `!=`                 | Not equal                     | `["status", "!=", "deleted"]`             |
| `<`, `>`, `<=`, `>=` | Comparison                    | `["size", ">", 1000000]`                  |
| `contains`           | Array membership or substring | `["tags", "contains", "urgent"]`          |
| `contains-all`       | Array contains ALL values     | `["tags", "contains-all", ["a", "b"]]`    |
| `contains-any`       | Array contains ANY value      | `["tags", "contains-any", ["a", "b"]]`    |
| `not-contains`       | Array does NOT contain        | `["tags", "not-contains", "archived"]`    |
| `in`                 | Value in list                 | `["status", "in", ["open", "pending"]]`   |
| `not-in`             | Value NOT in list             | `["status", "not-in", ["deleted"]]`       |
| `match`              | Full-text search              | `["fulltext", "match", "contract terms"]` |

### 7.3 Semantic Search

For AI-powered semantic search, pass a string starting with `?`:

```javascript
await nodes.find("?documents about project deadlines");
```

Note: Semantic search cannot be combined with other filters.

### 7.4 Querying Aspect Properties

Aspect properties are queried using the format `${aspectUuid}:${propertyName}`:

```javascript
// Find all invoices with amount > 10000
[
  ["aspects", "contains", "invoice"],
  ["invoice:amount", ">", 10000],
][
  // Find pending invoices for a specific customer
  (["aspects", "contains", "invoice"],
  ["invoice:status", "==", "Pending"],
  ["invoice:customerId", "==", "customer-456"])
];
```

---

## 8. Error Handling: Either Pattern

All Antbox operations return `Either<Error, Value>`:

```typescript
const result = await nodes.get(uuid);

if (result.isLeft()) {
  // Error case
  console.error(result.value.message);
  return;
}

// Success case
const node = result.value;
```

This pattern ensures explicit error handling throughout the codebase.

---

## 9. Examples

### 9.1 Creating a Customer Aspect

```typescript
const customerAspect = {
  uuid: "customer",
  title: "Customer Data",
  description: "Core customer information",
  filters: [],
  properties: [
    {
      name: "company-name",
      title: "Company Name",
      type: "string",
      required: true,
    },
    {
      name: "contact-email",
      title: "Contact Email",
      type: "string",
      validationRegex: "^[\\w-\\.]+@([\\w-]+\\.)+[\\w-]{2,4}$",
    },
    {
      name: "tier",
      title: "Customer Tier",
      type: "string",
      validationList: ["Bronze", "Silver", "Gold", "Platinum"],
      defaultValue: "Bronze",
    },
    {
      name: "annual-revenue",
      title: "Annual Revenue",
      type: "number",
    },
  ],
};
```

### 9.2 Creating a Document Analyzer Feature

```javascript
export default {
  uuid: "analyzeDocument",
  title: "Analyze Document",
  description: "Extracts key information from documents using AI",

  exposeAction: true,
  exposeAITool: true,
  exposeExtension: false,

  runManually: true,
  runOnCreates: false,
  runOnUpdates: false,
  runOnDeletes: false,

  filters: [["mimetype", "in", ["application/pdf", "text/plain"]]],
  groupsAllowed: [],

  parameters: [
    { name: "uuids", type: "array", arrayType: "string", required: true },
    {
      name: "extractFields",
      type: "array",
      arrayType: "string",
      required: false,
    },
  ],
  returnType: "object",

  async run(ctx, args) {
    const results = {};

    for (const uuid of args.uuids) {
      const nodeOrErr = await ctx.nodeService.get(uuid);
      if (nodeOrErr.isLeft()) {
        results[uuid] = { error: nodeOrErr.value.message };
        continue;
      }

      const node = nodeOrErr.value;
      // Process document...
      results[uuid] = {
        title: node.title,
        extracted: {
          /* ... */
        },
      };
    }

    return results;
  },
};
```

### 9.3 Creating an Agent Configuration

```typescript
const supportAgent = {
  uuid: "customer-support",
  title: "Customer Support Agent",
  description: "Helps users find and manage customer information",
  model: "default",
  temperature: 0.3,
  maxTokens: 4096,
  reasoning: true,
  useTools: true,
  useSkills: true,
  skillsAllowed: ["querying"],
  systemInstructions: `
You are a customer support assistant for Antbox.

Your capabilities:
1. Search for customer records using the querying skill
2. View and explain customer data
3. Help users understand aspect properties

Guidelines:
- Always load the querying skill first when searching
- Use filters to narrow down results
- Explain data in clear, business-friendly terms
- Never modify data without explicit user confirmation
  `,
};
```

### 9.4 Querying Business Entities

```javascript
// Find all Gold-tier customers
const goldCustomers = await nodes.find([
  ["aspects", "contains", "customer"],
  ["customer:tier", "==", "Gold"],
]);

// Find high-value pending invoices
const urgentInvoices = await nodes.find([
  ["aspects", "contains", "invoice"],
  ["invoice:status", "==", "Pending"],
  ["invoice:amount", ">", 50000],
]);

// Find documents created this month
const thisMonth = new Date();
const startOfMonth = new Date(
  thisMonth.getFullYear(),
  thisMonth.getMonth(),
  1,
).toISOString();

const recentDocs = await nodes.find([
  ["createdTime", ">=", startOfMonth],
  ["mimetype", "!=", "application/vnd.antbox.folder"],
]);
```

---

## 10. Architecture Patterns

### 10.1 Service/Engine Separation

- **Services** handle CRUD operations and state management
- **Engines** handle dynamic execution and orchestration

Example: `AgentsService` manages agent configurations, `AgentsEngine` executes agent conversations.

### 10.2 Access Control

| Resource | Create/Delete               | Update                      | Read                        |
| -------- | --------------------------- | --------------------------- | --------------------------- |
| Agents   | Admin only                  | Admin only                  | All users                   |
| Features | Admin only                  | Admin only                  | Filtered by groupsAllowed   |
| Aspects  | Admin only                  | Admin only                  | All users                   |
| Skills   | Admin only                  | Admin only                  | Controlled by agent config  |
| Nodes    | Based on folder permissions | Based on folder permissions | Based on folder permissions |

### 10.3 Multi-Tenancy

Each tenant has completely isolated:

- Configuration repository
- Node repository
- Storage provider
- Event store
- Crypto keys

---

## 11. Quick Reference

### Common Mimetypes

| Mimetype                             | Description                     |
| ------------------------------------ | ------------------------------- |
| `application/vnd.antbox.folder`      | Folder                          |
| `application/vnd.antbox.smartfolder` | Smart folder                    |
| `application/vnd.antbox.metanode`    | Business entity (metadata only) |
| `application/vnd.antbox.article`     | Rich text article               |
| `application/pdf`                    | PDF document                    |
| `image/png`, `image/jpeg`            | Images                          |
| `text/plain`, `text/markdown`        | Text files                      |

### Builtin Groups

| UUID            | Purpose                |
| --------------- | ---------------------- |
| `--admins--`    | System administrators  |
| `--users--`     | Regular users          |
| `--anonymous--` | Unauthenticated access |

### SDK Methods Summary

**Nodes SDK:**
`get`, `list`, `find`, `breadcrumbs`, `create`, `createFile`, `update`, `updateFile`, `delete`, `export`, `copy`, `duplicate`, `evaluate`, `lock`, `unlock`

**Aspects SDK:**
`get`, `listAspects`

**Internal Tools:**
`loadSdkDocumentation`, `runCode`, `loadSkill`
