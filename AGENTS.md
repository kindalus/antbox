# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
# Run tests
deno task test                    # All tests
deno task test:watch              # Watch mode
deno task test:coverage           # With coverage report
deno task test:services           # Core service tests only

# Adapter integration tests
deno task test-node-repository    # Test NodeRepository implementations
deno task test-storage-provider   # Test StorageProvider implementations

# Lint and format
deno lint                         # Check code style
deno fmt                          # Format code (tabs, 100 char width)

# Run server
./start_server.sh --demo          # Development mode (SQLite + flat-file)
./start_server.sh -f config.toml  # Production with custom config
./start_server.sh --keys          # Generate crypto keys
```

## Architecture Overview

Antbox is an Enterprise Content Management (ECM) / Digital Asset Management (DAM) platform built with Deno and TypeScript. It follows **Hexagonal Architecture (Ports & Adapters)** with strict layer separation:

### Layers

1. **Domain** (`src/domain/`) - Pure business models with zero framework dependencies
   - All models use Zod for validation
   - Core types: `Node`, `FileNode`, `FolderNode`, `SmartFolderNode`, `Aspect`, `Workflow`, `Agent`

2. **Application** (`src/application/`) - Business logic orchestration
   - **Services**: CRUD and business operations (e.g., `NodeService`, `UsersService`, `AgentsService`)
   - **Engines**: Dynamic execution (e.g., `AgentsEngine` for AI, `FeaturesEngine` for custom code, `WorkflowInstancesEngine` for state machines)

3. **Adapters** (`src/adapters/`) - Infrastructure implementations
   - HTTP: Oak framework (`oak/`)
   - Storage: S3, Google Drive, flat-file, in-memory
   - Repositories: SQLite, PostgreSQL, MongoDB, PouchDB, flat-file, in-memory
   - AI Models: Google Gemini, OpenAI, Anthropic, Ollama

4. **API** (`src/api/`) - HTTP handlers and middleware

### Key Patterns

**Either<Error, Value>** - Used throughout for explicit error handling (no exceptions):
```typescript
async create(data: NodeMetadata): Promise<Either<ValidationError, Node>>
// Returns left(error) or right(value)
```

**Service/Engine Separation**:
- Services manage state/configuration (CRUD, persistence)
- Engines execute dynamic behavior (run workflows, AI agents, custom features)

**Multi-Tenancy** - Each tenant is completely isolated:
- Separate database, storage, event store, and crypto keys per tenant
- Configuration-driven tenant assembly in `src/setup/`

**Event-Driven** - Domain events for audit trails and loose coupling:
- Event bus in `src/adapters/inmem/inmem_event_bus.ts`
- Events: `NodeCreatedEvent`, `NodeUpdatedEvent`, `NodeDeletedEvent`, etc.

### Core Abstractions

| Interface | Purpose | Implementations |
|-----------|---------|-----------------|
| `NodeRepository` | Node metadata persistence | sqlite, postgres, mongodb, pouchdb, flat_file, inmem |
| `StorageProvider` | File blob storage | s3, google_drive, flat_file, inmem, null |
| `ConfigurationRepository` | System config (users, groups, workflows, etc.) | sqlite, postgres, mongodb, inmem |
| `EventStoreRepository` | Immutable audit log | sqlite, postgres, mongodb, flat_file, inmem |

### Entry Points

- `main.ts` - CLI entry point (parses args, loads config, starts server)
- `src/adapters/oak/server.ts` - Oak HTTP server with 18 API routers
- `src/api/authentication_middleware.ts` - JWT, API key, cookie auth

## Conventions

- When committing changes, use conventional commits and never add Claude references to the commit message
- Only commit on demand
- TypeScript only (no JavaScript files)
- Tabs for indentation, 100 character line width
- Use Zod for all input validation
- Use Either pattern for error handling instead of exceptions
- New adapters must implement the corresponding interface from `src/domain/` or `src/application/`
