# Antbox Platform Context for LLMs

## 1. System Overview

Antbox is an API-first Enterprise Content Management (ECM) server built on Deno. It follows a
hexagonal architecture with clear separation between domain logic, application services, and
adapters. Content is stored as **nodes**, while configuration (aspects, features, agents, workflows,
users, groups, API keys) is stored in a **configuration repository**.

## 2. Core Data Shapes

### 2.1 Node Metadata

Nodes represent content (files, folders, smart folders, meta nodes, articles).

```ts
type Permission = "Read" | "Write" | "Export";

type Permissions = {
  group: Permission[];
  authenticated: Permission[];
  anonymous: Permission[];
  advanced?: Record<string, Permission[]>;
};

type ArticleProperties = {
  articleTitle: string;
  articleFid: string;
  articleResume: string;
  articleBody: string;
};

type ArticlePropertiesMap = Record<string, ArticleProperties>;

type NodeFilters = NodeFilter[] | NodeFilter[][];

type NodeMetadata = {
  uuid: string;
  fid: string;
  title: string;
  description?: string;
  mimetype: string;
  parent: string;
  owner: string;
  createdTime: string;
  modifiedTime: string;
  fulltext?: string;
  tags?: string[];
  locked?: boolean;
  lockedBy?: string;
  unlockAuthorizedGroups?: string[];
  workflowInstanceUuid?: string;
  workflowState?: string;

  aspects?: string[];
  properties?: Record<string, unknown>;
  related?: string[];

  size?: number; // file nodes

  group?: string; // folders
  permissions?: Permissions; // folders
  onCreate?: string[]; // folders (feature UUIDs)
  onUpdate?: string[];
  onDelete?: string[];
  filters?: NodeFilters; // folders and smart folders

  articleProperties?: ArticlePropertiesMap; // articles
  articleAuthor?: string;
};

type NodeFilterResult = {
  pageToken: number;
  pageSize: number;
  nodes: NodeMetadata[];
  scores?: Record<string, number>;
};
```

Node types:
- Folder: `application/vnd.antbox.folder`
- Smart folder: `application/vnd.antbox.smartfolder`
- Meta node: `application/vnd.antbox.metanode`
- Article: `application/vnd.antbox.article`
- File: any other mimetype

The root folder UUID is `--root--`.

### 2.2 Aspects (configuration)

Aspects define reusable metadata schemas. They are not nodes.

```ts
type AspectData = {
  uuid: string;
  title: string;
  description?: string;
  filters: NodeFilters;
  properties: AspectProperty[];
  createdTime: string;
  modifiedTime: string;
};

type AspectProperty = {
  name: string; // /^[a-zA-Z_][_a-zA-Z0-9_]{2,}$/
  title: string;
  type: "uuid" | "string" | "number" | "boolean" | "object" | "array" | "file";
  arrayType?: "string" | "number" | "uuid";
  contentType?: string;
  readonly?: boolean;
  searchable?: boolean;
  validationRegex?: string;
  validationList?: string[];
  validationFilters?: NodeFilters;
  required?: boolean;
  defaultValue?: string | number | boolean;
};
```

Aspect values are stored on nodes using `properties` keys:
`"<aspect-uuid>:<property-name>"`.

### 2.3 Features (configuration)

Features are executable modules stored as configuration records.

```ts
type FeatureData = {
  uuid: string;
  title: string;
  description: string;
  exposeAction: boolean;
  runOnCreates: boolean;
  runOnUpdates: boolean;
  runOnDeletes: boolean;
  runManually: boolean;
  filters: NodeFilter[];
  exposeExtension: boolean;
  exposeAITool: boolean;
  runAs?: string;
  groupsAllowed: string[];
  parameters: FeatureParameter[];
  returnType: "string" | "number" | "boolean" | "array" | "object" | "file" | "void";
  returnDescription?: string;
  returnContentType?: string;
  tags?: string[];
  module: string; // JS/TS module as a string
  createdTime: string;
  modifiedTime: string;
};

type FeatureParameter = {
  name: string;
  type: "string" | "number" | "boolean" | "object" | "array" | "file";
  arrayType?: "string" | "number" | "file" | "object";
  contentType?: string;
  required: boolean;
  description?: string;
  defaultValue?: string | number | boolean | object | unknown[];
};
```

### 2.4 Agents (configuration)

```ts
type AgentData = {
  uuid: string;
  title: string;
  description?: string;
  model: string; // model name or "default"
  temperature: number;
  maxTokens: number;
  reasoning: boolean;
  useTools: boolean;
  systemInstructions: string;
  structuredAnswer?: string;
  createdTime: string;
  modifiedTime: string;
};
```

## 3. NodeFilters

Filters are used by search, smart folders, aspects, and features.

```ts
type FilterOperator =
  | "==" | "!=" | "<" | "<=" | ">" | ">="
  | "in" | "not-in"
  | "match"
  | "contains" | "contains-all" | "contains-any" | "not-contains" | "contains-none";

type NodeFilter = [field: string, operator: FilterOperator, value: unknown];

type NodeFilters = NodeFilter[] | NodeFilter[][];
```

String form is supported in `find()`:
- `,` = AND
- `|` = OR
- quote values with `"` if needed
- `?query` triggers semantic search (if AI is enabled)

Examples:
- `mimetype==application/pdf`
- `tags contains-all ("invoice","paid")`
- `?summarize project alpha`

## 4. Feature Runtime Context

A feature module exports a default object with a `run(ctx, args)` function. The runtime context is:

```ts
type Principal = { email: string; groups: string[] };

type AuthenticationContext = {
  tenant: string;
  principal: Principal;
  mode: "Direct" | "Action" | "AI";
};

type RunContext = {
  authenticationContext: AuthenticationContext;
  nodeService: NodeServiceProxy;
};
```

`NodeServiceProxy` methods:

```ts
interface NodeServiceProxy {
  get(uuid: string): Promise<Either<AntboxError, NodeMetadata>>;
  list(parent?: string): Promise<Either<AntboxError, NodeMetadata[]>>;
  find(filters: NodeFilters | string, pageSize?: number, pageToken?: number): Promise<Either<AntboxError, NodeFilterResult>>;
  breadcrumbs(uuid: string): Promise<Either<AntboxError, Array<{ uuid: string; title: string }>>>;
  create(metadata: Partial<NodeMetadata>): Promise<Either<AntboxError, NodeMetadata>>;
  createFile(file: File, metadata: Partial<NodeMetadata>): Promise<Either<AntboxError, NodeMetadata>>;
  update(uuid: string, metadata: Partial<NodeMetadata>): Promise<Either<AntboxError, void>>;
  updateFile(uuid: string, file: File): Promise<Either<AntboxError, void>>;
  delete(uuid: string): Promise<Either<AntboxError, void>>;
  export(uuid: string): Promise<Either<AntboxError, File>>;
  copy(uuid: string, parent: string): Promise<Either<AntboxError, NodeMetadata>>;
  duplicate(uuid: string): Promise<Either<AntboxError, NodeMetadata>>;
  evaluate(uuid: string): Promise<Either<AntboxError, unknown>>;
  lock(uuid: string, unlockAuthorizedGroups?: string[]): Promise<Either<AntboxError, void>>;
  unlock(uuid: string): Promise<Either<AntboxError, void>>;
}
```

## 5. Internal AI Tools

When `useTools` is enabled on an agent, two internal tools are available:

### 5.1 getSdkDocumentation

- **name**: `getSdkDocumentation`
- **params**: `{ sdkName?: "nodes" | "aspects" | "custom" }`
- **returns**: TypeScript declaration text for SDK methods

### 5.2 runCode

- **name**: `runCode`
- **params**: `{ code: string }`
- **returns**: string (result or error JSON)

The code must be an ESM module that default-exports an async function. It receives:

```ts
{
  nodes: NodeServiceProxy;
  aspects: AspectServiceProxy; // listAspects() / get(uuid)
  custom: unknown; // currently empty
}
```

Use `runCode` for controlled access to nodes/aspects when the model needs to retrieve or update
data during a conversation.
