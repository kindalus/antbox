# Antbox Architecture

This document describes the overall architecture of Antbox ECM system, which follows clean
architecture principles with clear separation of concerns.

## Architecture Overview

Antbox is built using a layered architecture pattern that promotes maintainability, testability, and
extensibility. The system is organized into distinct layers, each with specific responsibilities.

## Architecture Diagram

```mermaid
graph TB
    %% External Clients
    Client[Web Client/API Consumer]
    Docker[Docker Container]

    %% Entry Points
    Demo[demo.ts<br/>Persistent Server]
    Sandbox[sandbox.ts<br/>In-Memory Server]

    %% API Layer
    subgraph "API Layer (src/api/)"
        HttpServer[HTTP Server<br/>Oak/H3]
        AuthMiddleware[Authentication<br/>Middleware]
        Handlers[API Handlers<br/>- Nodes<br/>- Aspects<br/>- Actions<br/>- Login]
        TenantMgmt[Tenant Management]
    end

    %% Application Layer
    subgraph "Application Layer (src/application/)"
        NodeService[Node Service]
        AspectService[Aspect Service]
        ActionService[Action Service]
        SkillService[Skill Service]
        AuthService[Auth Service]
        UserGroupService[User/Group Service]
        ExtService[Extension Service]
        ArticleService[Article Service]
        ApiKeyService[API Key Service]
    end

    %% Domain Layer
    subgraph "Domain Layer (src/domain/)"
        subgraph "Core Entities"
            Node[Node<br/>- Metadata<br/>- Content<br/>- Aspects]
            Aspect[Aspect<br/>- Properties<br/>- Validation]
            Action[Action<br/>- Triggers<br/>- Filters]
            Function[Function<br/>- Parameters<br/>- Runtime]
            User[User/Group<br/>- Permissions<br/>- Security]
        end

        NodeRepo[Node Repository<br/>Interface]
        StorageProvider[Storage Provider<br/>Interface]
        NodeFilters[Node Filters]
        NodeFactory[Node Factory]
    end

    %% Adapters Layer
    subgraph "Adapters Layer (src/adapters/)"
        subgraph "Repository Implementations"
            InMemRepo[In-Memory<br/>Repository]
            PouchDB[PouchDB<br/>Repository]
            MongoDB[MongoDB<br/>Repository]
        end

        subgraph "Storage Implementations"
            InMemStorage[In-Memory<br/>Storage]
            FlatFile[Flat File<br/>Storage]
            S3Storage[S3 Storage]
            GoogleDrive[Google Drive<br/>Storage]
            NullStorage[Null Storage]
        end

        subgraph "HTTP Server Implementations"
            OakAdapter[Oak Server<br/>Adapter]
            H3Adapter[H3 Server<br/>Adapter]
        end
    end

    %% Setup & Configuration
    subgraph "Setup Layer (src/setup/)"
        TenantSetup[Tenant Setup]
        ServerDefaults[Server Defaults<br/>- JWK Keys<br/>- Root Password<br/>- Symmetric Key]
    end

    %% External Services
    subgraph "External Integrations"
        JWT[JWT Authentication<br/>Jose Library]
        FileSystem[File System]
        Database[(Database)]
        CloudStorage[(Cloud Storage)]
    end

    %% Connections
    Client --> HttpServer
    Docker --> Demo
    Docker --> Sandbox

    Demo --> TenantSetup
    Sandbox --> TenantSetup
    TenantSetup --> HttpServer

    HttpServer --> AuthMiddleware
    AuthMiddleware --> Handlers
    Handlers --> TenantMgmt

    Handlers --> NodeService
    Handlers --> AspectService
    Handlers --> ActionService
    Handlers --> AuthService

    NodeService --> NodeRepo
    NodeService --> StorageProvider
    NodeService --> NodeFactory

    AspectService --> NodeService
    ActionService --> SkillService
    SkillService --> NodeService

    NodeRepo -.-> InMemRepo
    NodeRepo -.-> PouchDB
    NodeRepo -.-> MongoDB

    StorageProvider -.-> InMemStorage
    StorageProvider -.-> FlatFile
    StorageProvider -.-> S3Storage
    StorageProvider -.-> GoogleDrive

    TenantSetup --> ServerDefaults

    %% External connections
    PouchDB --> Database
    MongoDB --> Database
    S3Storage --> CloudStorage
    GoogleDrive --> CloudStorage
    FlatFile --> FileSystem

    AuthService --> JWT

    %% Multi-tenancy flow
    TenantMgmt -.-> NodeService
    TenantMgmt -.-> AspectService

    classDef apiLayer fill:#e1f5fe
    classDef appLayer fill:#f3e5f5
    classDef domainLayer fill:#e8f5e8
    classDef adapterLayer fill:#fff3e0
    classDef setupLayer fill:#fce4ec
    classDef external fill:#f5f5f5

    class HttpServer,AuthMiddleware,Handlers,TenantMgmt apiLayer
    class NodeService,AspectService,ActionService,SkillService,AuthService,UserGroupService,ExtService,ArticleService,ApiKeyService appLayer
    class Node,Aspect,Action,Skill,User,NodeRepo,StorageProvider,NodeFilters,NodeFactory,NodesFilters domainLayer
    class InMemRepo,PouchDB,MongoDB,InMemStorage,FlatFile,S3Storage,GoogleDrive,OakAdapter,H3Adapter,NullStorage adapterLayer
    class TenantSetup,ServerDefaults setupLayer
    class JWT,FileSystem,Database,CloudStorage external
```

## NodeFilter - A Key Architectural Concept

**NodeFilter** is one of the most important concepts in Antbox, providing a powerful and flexible
way to query, filter, and match nodes across the entire system. It serves as the foundation for
content discovery, smart folders, feature targeting, and automated workflows.

### NodeFilter Structure

A NodeFilter is a tuple-based query system:

```typescript
type NodeFilter = [field: string, operator: FilterOperator, value: unknown];
```

**Supported Operators:**

- **Equality**: `==`, `!=`
- **Comparison**: `<`, `<=`, `>`, `>=`
- **Array operations**: `in`, `not-in`, `contains`, `contains-all`, `contains-any`, `not-contains`,
  `contains-none`
- **Text matching**: `match` (regex-based fuzzy matching)

### NodeFilters Combinations

NodeFilter supports both simple and complex query structures:

```typescript
// 1D Filters (AND logic within array)
type NodeFilters1D = NodeFilter[];
// Example: [["type", "==", "file"], ["size", ">", 1000]]
// Matches: nodes that are files AND larger than 1000 bytes

// 2D Filters (OR logic between arrays, AND within arrays)
type NodeFilters2D = NodeFilters1D[];
// Example: [[["type", "==", "file"]], [["type", "==", "folder"]]]
// Matches: nodes that are files OR folders
```

### Core Use Cases

1. **Content Discovery**: The `/nodes/-/find` API endpoint uses NodeFilter for powerful search
   capabilities
2. **Smart Folders**: Dynamic content aggregation based on filter criteria
3. **Feature Targeting**: Actions and Extensions use filters to determine when they apply
4. **Access Control**: Folder-based security leverages filters for permission evaluation
5. **System Folders**: Built-in folders use filters to automatically organize content

### Implementation Architecture

**NodesFilters Class** (`src/domain/nodes_filters.ts`):

- Converts NodeFilter expressions into executable specifications
- Provides field path resolution (e.g., `"metadata.size"`, `"aspects.custom.value"`)
- Implements all filter operators with type safety

**Repository Integration**:

- **MongoDB**: Translates filters to MongoDB query syntax
- **PouchDB**: Converts to Mango query format
- **In-Memory**: Uses JavaScript predicates for filtering
- **Flat File**: Delegates to in-memory implementation

**API Integration**:

- **POST /nodes/-/find**: Accept filters in request body
- **GET /nodes?parent=uuid**: Built-in parent folder filtering
- Smart folder resolution uses filters for dynamic content

### Field Path Resolution

NodeFilter supports deep field access using dot notation:

```typescript
// Access node metadata
["metadata.name", "match", "document"][
	// Access aspect properties
	("aspects.custom.category", "==", "important")
][
	// Access array elements
	("tags", "contains", "urgent")
];
```

This makes NodeFilter incredibly powerful for querying complex node structures and custom aspects.

## Architectural Layers

### 1. Domain Layer (`src/domain/`)

The core business logic layer containing:

- **Entities**: Node, Aspect, Action, Function, User/Group
- **Repository Interfaces**: Define contracts for data persistence
- **Business Rules**: Domain-specific validation and logic
- **Value Objects**: Immutable objects representing domain concepts

### 2. Application Layer (`src/application/`)

Orchestrates business operations and use cases:

- **Services**: Coordinate domain operations and enforce business rules
- **DTOs**: Data transfer objects for layer communication
- **Authentication**: Security and authorization logic
- **Domain Events**: Cross-cutting concerns and notifications

### 3. API Layer (`src/api/`)

Handles external communication:

- **HTTP Handlers**: REST API endpoints
- **Middleware**: Authentication, error handling, tenant resolution
- **Request/Response Processing**: Data validation and transformation
- **Tenant Management**: Multi-tenant request routing

### 4. Adapters Layer (`src/adapters/`)

Infrastructure implementations:

- **Repository Implementations**: PouchDB, MongoDB, In-Memory
- **Storage Providers**: File system, S3, Google Drive
- **HTTP Server Adapters**: Oak, H3 framework integrations
- **External Service Integrations**: Authentication libraries

### 5. Setup Layer (`src/setup/`)

Configuration and initialization:

- **Tenant Configuration**: Multi-tenant setup and defaults
- **Server Defaults**: Security keys, passwords, ports
- **Dependency Injection**: Wiring of implementations

## Key Architectural Features

### Multi-Tenancy

- Isolated tenant contexts with separate storage and repositories
- Configurable per-tenant settings and customizations
- Tenant-aware API routing and security

### Pluggable Architecture

- Repository pattern enables multiple database backends
- Storage provider abstraction supports various file storage systems
- HTTP server abstraction allows different web frameworks

### Content Management

- **Nodes**: Core content entities with rich metadata
- **Aspects**: Extensible schema system for custom properties
- **Actions**: Event-driven behaviors and automation
- **Functions**: Custom JavaScript execution environment

### Security

- JWT-based authentication with configurable keys
- Folder-based hierarchical access control
- Role-based permissions and API key management
- Secure multi-tenant isolation

### Deployment Modes

- **Sandbox Mode**: Fully in-memory for development and testing
- **Demo Mode**: Persistent storage with PouchDB and flat files
- **Production Mode**: Configurable with enterprise databases and cloud storage
- **Docker Support**: Containerized deployment with volume mounting

## Technology Stack

- **Runtime**: Deno with TypeScript
- **Web Frameworks**: Oak, H3
- **Databases**: PouchDB, MongoDB
- **Storage**: File System, AWS S3, Google Drive
- **Authentication**: JWT (Jose library)
- **Build**: Native Deno tooling

## Benefits of This Architecture

1. **Maintainability**: Clear separation of concerns and well-defined interfaces
2. **Testability**: Each layer can be tested in isolation with dependency injection
3. **Extensibility**: New storage providers and features can be added without core changes
4. **Scalability**: Multi-tenant architecture supports horizontal scaling
5. **Flexibility**: Multiple deployment modes from development to enterprise production
