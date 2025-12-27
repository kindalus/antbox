# Configuration Migration Plan: Split Nodes from Configuration

## Overview
This plan migrates all configuration artifacts from the Node-based repository to a dedicated ConfigurationRepository with typed collections.

---

## Configuration Collections

### 1. **Users Collection**

#### Data Structure: `UserData`
```typescript
interface UserData {
  uuid: string;
  title: string;           // Full name (first + last)
  email: string;           // Unique identifier
  group: string;           // Primary group UUID
  groups: string[];        // All group memberships
  phone?: string;
  hasWhatsapp: boolean;
  active: boolean;         // Can user login?
  createdTime: string;
  modifiedTime: string;
}
```

#### Zod Schema
```typescript
const UserDataSchema = z.object({
  uuid: z.string().uuid(),
  title: z.string().regex(/^(\s*\S+(?:\s+\S+)+\s*|root|anonymous)$/, "Full name required"),
  email: z.string().email(),
  group: z.string().min(1),
  groups: z.array(z.string()),
  phone: z.string().optional(),
  hasWhatsapp: z.boolean(),
  active: z.boolean(),
  createdTime: z.string().datetime(),
  modifiedTime: z.string().datetime(),
});
```

#### Migration from UserNode
- **Remove from NodeMetadata**: `mimetype`, `parent`, `owner`, `fid`, `locked`, `lockedBy`, `unlockAuthorizedGroups`, `tags`, `fulltext`
- **Keep**: All UserNode-specific fields
- **Builtin objects**: Root user, Anonymous user, Workflow-instance user, Lock-system user

---

### 2. **Groups Collection**

#### Data Structure: `GroupData`
```typescript
interface GroupData {
  uuid: string;
  title: string;           // Group name
  description?: string;
  createdTime: string;
  modifiedTime: string;
}
```

#### Zod Schema
```typescript
const GroupDataSchema = z.object({
  uuid: z.string().uuid(),
  title: z.string().min(3),
  description: z.string().optional(),
  createdTime: z.string().datetime(),
  modifiedTime: z.string().datetime(),
});
```

#### Migration from GroupNode
- **Remove from NodeMetadata**: `mimetype`, `parent`, `owner`, `fid`, `email`, `locked`, `lockedBy`, `unlockAuthorizedGroups`, `tags`, `fulltext`
- **Keep**: `uuid`, `title`, `description`, timestamps
- **Builtin objects**: Admins, Authenticated, Anonymous groups

---

### 3. **Aspects Collection**

#### Data Structure: `AspectData`
```typescript
interface AspectData {
  uuid: string;
  title: string;
  description?: string;
  filters: NodeFilters;
  properties: AspectProperty[];
  createdTime: string;
  modifiedTime: string;
}
```

#### Zod Schema
```typescript
const AspectDataSchema = z.object({
  uuid: z.string().uuid(),
  title: z.string().min(3),
  description: z.string().optional(),
  filters: z.array(z.any()), // NodeFilters type
  properties: z.array(AspectPropertySchema),
  createdTime: z.string().datetime(),
  modifiedTime: z.string().datetime(),
});
```

#### Migration from AspectNode
- **Remove from NodeMetadata**: `mimetype`, `parent`, `owner`, `fid`, `locked`, `lockedBy`, `unlockAuthorizedGroups`, `tags`, `fulltext`
- **Keep**: All aspect-specific fields (filters, properties)
- **Builtin objects**: System-defined aspects

---

### 4. **Features Collection**

#### Data Structure: `FeatureData`
```typescript
interface FeatureData {
  uuid: string;
  title: string;
  description?: string;
  code: string;              // JavaScript/TypeScript source code
  
  // Exposure settings
  exposeAction: boolean;
  exposeExtension: boolean;
  exposeAITool: boolean;
  
  // Action-specific settings
  runOnCreates: boolean;
  runOnUpdates: boolean;
  runOnDeletes: boolean;
  runManually: boolean;
  filters: NodeFilters;
  
  // Execution settings
  runAs?: string;
  groupsAllowed: string[];
  
  // Function signature
  parameters: FeatureParameter[];
  returnType: "string" | "number" | "boolean" | "array" | "object" | "file" | "void";
  returnDescription?: string;
  returnContentType?: string;
  
  tags?: string[];
  createdTime: string;
  modifiedTime: string;
}
```

#### Zod Schema
```typescript
const FeatureDataSchema = z.object({
  uuid: z.string().uuid(),
  title: z.string().min(3),
  description: z.string().optional(),
  code: z.string().min(1),
  exposeAction: z.boolean(),
  exposeExtension: z.boolean(),
  exposeAITool: z.boolean(),
  runOnCreates: z.boolean(),
  runOnUpdates: z.boolean(),
  runOnDeletes: z.boolean(),
  runManually: z.boolean(),
  filters: z.array(z.any()),
  runAs: z.string().optional(),
  groupsAllowed: z.array(z.string()),
  parameters: z.array(FeatureParameterSchema),
  returnType: z.enum(["string", "number", "boolean", "array", "object", "file", "void"]),
  returnDescription: z.string().optional(),
  returnContentType: z.string().optional(),
  tags: z.array(z.string()).optional(),
  createdTime: z.string().datetime(),
  modifiedTime: z.string().datetime(),
});
```

#### Migration from FeatureNode
- **Remove from NodeMetadata**: `mimetype`, `parent`, `owner`, `fid`, `size`, `locked`, `lockedBy`, `unlockAuthorizedGroups`, `fulltext`
- **Add**: `code` field (read from storage provider)
- **Keep**: All feature-specific fields
- **Storage Change**: Code no longer stored in filesystem, stored in `code` field
- **Builtin objects**: System features (move_up, etc.)

---

### 5. **Agents Collection**

#### Data Structure: `AgentData`
```typescript
interface AgentData {
  uuid: string;
  title: string;
  description?: string;
  model: string;
  temperature: number;
  maxTokens: number;
  reasoning: boolean;
  useTools: boolean;
  systemInstructions: string;
  structuredAnswer?: string;
  createdTime: string;
  modifiedTime: string;
}
```

#### Zod Schema
```typescript
const AgentDataSchema = z.object({
  uuid: z.string().uuid(),
  title: z.string().min(3),
  description: z.string().optional(),
  model: z.string().min(1),
  temperature: z.number().min(0).max(2),
  maxTokens: z.number().min(1),
  reasoning: z.boolean(),
  useTools: z.boolean(),
  systemInstructions: z.string().min(1),
  structuredAnswer: z.string().optional(),
  createdTime: z.string().datetime(),
  modifiedTime: z.string().datetime(),
});
```

#### Migration from AgentNode
- **Remove from NodeMetadata**: `mimetype`, `parent`, `owner`, `fid`, `locked`, `lockedBy`, `unlockAuthorizedGroups`, `tags`, `fulltext`
- **Keep**: All agent-specific fields
- **Builtin objects**: RAG agent, built-in agents

---

### 6. **API Keys Collection**

#### Data Structure: `ApiKeyData`
```typescript
interface ApiKeyData {
  uuid: string;
  title: string;           // Masked secret (e.g., "abcd******")
  secret: string;          // Full secret
  group: string;           // Group this key belongs to
  createdTime: string;
  modifiedTime: string;
}
```

#### Zod Schema
```typescript
const ApiKeyDataSchema = z.object({
  uuid: z.string().uuid(),
  title: z.string().min(1),
  secret: z.string().min(1),
  group: z.string().min(1),
  createdTime: z.string().datetime(),
  modifiedTime: z.string().datetime(),
});
```

#### Migration from ApiKeyNode
- **Remove from NodeMetadata**: `mimetype`, `parent`, `owner`, `fid`, `description`, `locked`, `lockedBy`, `unlockAuthorizedGroups`, `tags`, `fulltext`
- **Keep**: `uuid`, `title`, `secret`, `group`, timestamps
- **Note**: API keys are immutable (cannot be updated)

---

### 7. **Workflows Collection**

#### Data Structure: `WorkflowData`
```typescript
interface WorkflowData {
  uuid: string;
  title: string;
  description?: string;
  states: WorkflowState[];
  availableStateNames: string[];
  filters: NodeFilters;
  groupsAllowed: string[];
  createdTime: string;
  modifiedTime: string;
}
```

#### Zod Schema
```typescript
const WorkflowDataSchema = z.object({
  uuid: z.string().uuid(),
  title: z.string().min(3),
  description: z.string().optional(),
  states: z.array(WorkflowStateSchema).min(1),
  availableStateNames: z.array(z.string()).min(1),
  filters: z.array(z.any()),
  groupsAllowed: z.array(z.string()),
  createdTime: z.string().datetime(),
  modifiedTime: z.string().datetime(),
});
```

#### Migration from WorkflowNode
- **Remove from NodeMetadata**: `mimetype`, `parent`, `owner`, `fid`, `locked`, `lockedBy`, `unlockAuthorizedGroups`, `tags`, `fulltext`
- **Keep**: All workflow-specific fields
- **Builtin objects**: Quick task workflow, Standard task workflow

---

### 8. **Workflow Instances Collection**

#### Data Structure: `WorkflowInstanceData`
```typescript
interface WorkflowInstanceData {
  uuid: string;
  workflowDefinitionUuid: string;
  workflowDefinition?: WorkflowDefinitionSnapshot;
  nodeUuid: string;
  currentStateName: string;
  history?: WorkflowTransitionHistory[];
  running: boolean;
  cancelled: boolean;
  groupsAllowed: string[];
  owner: string;
  startedTime: string;
}
```

#### Zod Schema
```typescript
const WorkflowInstanceDataSchema = z.object({
  uuid: z.string().uuid(),
  workflowDefinitionUuid: z.string().uuid(),
  workflowDefinition: WorkflowDefinitionSnapshotSchema.optional(),
  nodeUuid: z.string().uuid(),
  currentStateName: z.string().min(1),
  history: z.array(WorkflowTransitionHistorySchema).optional(),
  running: z.boolean(),
  cancelled: z.boolean(),
  groupsAllowed: z.array(z.string()),
  owner: z.string().email(),
  startedTime: z.string().datetime(),
});
```

#### Migration from WorkflowInstanceRepository
- **Merge**: Combine workflow instances into same configuration repository
- **No change**: Already separate from nodes
- **Keep**: All existing fields

---

## ConfigurationRepository Interface

```typescript
interface CollectionMap {
  "users": UserData;
  "groups": GroupData;
  "aspects": AspectData;
  "features": FeatureData;
  "agents": AgentData;
  "apikeys": ApiKeyData;
  "workflows": WorkflowData;
  "workflowInstances": WorkflowInstanceData;
}

interface ConfigurationRepository {
  /**
   * SAVE (Upsert):
   * Persists the state of the object.
   * - If the UUID exists, it updates the record.
   * - If the UUID is new, it creates the record.
   */
  save<K extends keyof CollectionMap>(
    collection: K,
    data: CollectionMap[K]
  ): Promise<Either<AntboxError, CollectionMap[K]>>;

  /**
   * READ by UUID
   */
  get<K extends keyof CollectionMap>(
    collection: K,
    uuid: string
  ): Promise<Either<AntboxError, CollectionMap[K]>>;

  /**
   * LIST all items in collection
   */
  list<K extends keyof CollectionMap>(
    collection: K
  ): Promise<Either<AntboxError, CollectionMap[K][]>>;

  /**
   * DELETE by UUID
   */
  delete<K extends keyof CollectionMap>(
    collection: K,
    uuid: string
  ): Promise<Either<AntboxError, void>>;
}
```

---

## Migration Steps (Per Configuration Type)

### Phase 1: Setup Infrastructure
1. Create `src/domain/configuration/` directory
2. Create data interfaces: `*_data.ts` files
3. Create Zod schemas: `*_schema.ts` files
4. Create `configuration_repository.ts` interface
5. Create in-memory implementation: `inmem_configuration_repository.ts`

### Phase 2: Migrate One Type at a Time (Iterative)

For each configuration type (in order):

#### Step 1: Create Data Structure Files
- `src/domain/configuration/user_data.ts`
- `src/domain/configuration/user_schema.ts`

#### Step 2: Update Service Layer
- Remove dependency on NodeService
- Add ConfigurationRepository dependency
- Update methods to use `configRepo.save("users", userData)`
- Remove DTO files (rename to `*_data.ts`)

#### Step 3: Update API Layer
- Update handlers to work with new data structures
- Remove node-based create/update logic
- Update response types

#### Step 4: Update Routers
- Keep same endpoints (minimize API breaking changes)
- Update request/response handling

#### Step 5: Migrate Builtin Objects
- Move from `builtin_*` folders to config repository initialization
- Load at startup via `setupTenants`

#### Step 6: Update Documentation
- Update OpenAPI spec
- Update API documentation

#### Step 7: Data Migration Script
- Read all nodes with specific mimetype from NodeRepository
- Convert to new data structure
- Save to ConfigurationRepository
- Delete from NodeRepository

---

## Migration Order (Suggested)

1. **Groups** (simplest, no dependencies)
2. **Users** (depends on Groups)
3. **API Keys** (simple, depends on Groups)
4. **Aspects** (no dependencies on other config)
5. **Workflows** (no dependencies)
6. **Workflow Instances** (depends on Workflows, already separate)
7. **Agents** (depends on nothing)
8. **Features** (most complex, depends on everything, has file storage)

---

## Files to Create/Modify

### New Files
- `src/domain/configuration/configuration_repository.ts`
- `src/domain/configuration/user_data.ts`
- `src/domain/configuration/user_schema.ts`
- `src/domain/configuration/group_data.ts`
- `src/domain/configuration/group_schema.ts`
- `src/domain/configuration/aspect_data.ts`
- `src/domain/configuration/aspect_schema.ts`
- `src/domain/configuration/feature_data.ts`
- `src/domain/configuration/feature_schema.ts`
- `src/domain/configuration/agent_data.ts`
- `src/domain/configuration/agent_schema.ts`
- `src/domain/configuration/apikey_data.ts`
- `src/domain/configuration/apikey_schema.ts`
- `src/domain/configuration/workflow_data.ts`
- `src/domain/configuration/workflow_schema.ts`
- `src/domain/configuration/workflow_instance_data.ts`
- `src/domain/configuration/workflow_instance_schema.ts`
- `src/adapters/inmem/inmem_configuration_repository.ts`
- `src/adapters/mongodb/mongodb_configuration_repository.ts` (future)
- `tools/migrate_config.ts` (data migration script)

### Files to Delete
- `src/domain/aspects/aspect_node.ts`
- `src/domain/features/feature_node.ts`
- `src/domain/users_groups/user_node.ts`
- `src/domain/users_groups/group_node.ts`
- `src/domain/api_keys/api_key_node.ts`
- `src/domain/ai/agent_node.ts`
- `src/domain/workflows/workflow_node.ts`
- `src/application/aspect_dto.ts`
- `src/application/feature_dto.ts`
- `src/application/agent_dto.ts`
- All `builtin_*` folders (move to config initialization)

### Files to Modify
- `src/setup/setup_tenants.ts` (add ConfigurationRepository)
- `src/api/antbox_tenant.ts` (add configRepository field)
- `src/application/*_service.ts` (all services using config)
- `src/api/*_handlers.ts` (all API handlers)
- `src/adapters/oak/*_router.ts` (all routers)
- `src/domain/nodes/node_metadata.ts` (remove config-specific fields)
- `src/domain/nodes/nodes.ts` (remove config mimetypes)
- `src/domain/node_factory.ts` (remove config node creation)
- `openapi.yaml` (update API documentation)

---

## Breaking Changes

### API Changes (Minimal)
- Same endpoints: `GET /api/v2/aspects/:uuid`
- Same HTTP methods
- Response bodies slightly different (no `fid`, `parent`, `mimetype`)
- No longer appear in node list/search results

### Conceptual Changes
- Configuration no longer organized in folders
- No permission inheritance from folders
- Separate backup/restore for config vs content
- Cannot use node-based queries on config

---

## Validation & Testing

For each migration:
1. Unit tests for data schemas (Zod validation)
2. Unit tests for service methods
3. Integration tests for API endpoints
4. Migration script validation (dry-run mode)
5. Builtin objects loaded correctly
6. All references between config types work

---

## Rollback Plan

If migration fails:
1. Keep old Node-based code in separate branch
2. Migration script creates backup before deletion
3. Can restore from backup and revert code
4. Feature flags to switch between old/new implementations during transition

---

## Timeline Estimate

- **Infrastructure Setup**: 1 type (example)
- **Each Type Migration**: After approval
- **Testing & Validation**: Per type
- **Documentation**: Per type

---

## Questions for Approval

1. Should we keep same API endpoints or create new `/api/v2/config/*` endpoints?
2. Should builtin objects be hardcoded or stored in config repository?
3. Should we support importing old node-based config exports?
4. What order do you prefer for migration?
5. Do you want to start with one type as proof-of-concept?

**Ready for your approval to proceed!**
