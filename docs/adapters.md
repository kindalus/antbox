# Adapters

Antbox uses a ports-and-adapters architecture. Each tenant is assembled from adapter modules loaded
from `antbox.toml`.

## Module array format

Each adapter setting is an array where the first value is the module path and remaining values are
constructor parameters:

```toml
repository = ["inmem/inmem_node_repository.ts"]
storage = ["flat_file/flat_file_storage_provider.ts", "/var/lib/antbox/storage"]
eventStoreRepository = ["inmem/inmem_event_store_repository.ts"]
```

Rules:

- Relative-style adapter names (no `./` and no URL) are resolved under `src/adapters/`.
- Paths beginning with `./` are loaded as explicit module paths.
- URLs can also be used for remote modules.

## Core adapter slots

Per tenant, the main adapter slots are:

- `repository` - node metadata persistence (`NodeRepository`)
- `storage` - file blob storage (`StorageProvider`)
- `eventStoreRepository` - audit/event persistence (required)
- `configurationRepository` - config entities (users, groups, features, agents, workflows)
- `vectorDatabase` / embedding-related adapters for AI retrieval

## Common built-ins

- repositories: `inmem`, `flat_file`, `mongodb`, `pouchdb`, `sqlite`, `postgres`
- storage: `inmem`, `flat_file`, `google_drive`, `s3`
- embeddings: deterministic and provider-backed adapters (for example Gemini)
- OCR: null/text and provider-backed OCR adapters

## Validation scripts

Use these tasks to run adapter contract checks:

```bash
deno task test-node-repository
deno task test-storage-provider
```

These tasks execute contract suites using the configured runner scripts in `src/adapters/`.
