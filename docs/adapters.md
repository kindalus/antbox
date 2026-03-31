---
name: adapters
description: Adapters configuration reference
---

# Adapters

Antbox uses a ports-and-adapters architecture. Each tenant is assembled from adapter modules loaded
from `config.toml` in the active configuration directory.

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
- `embeddingProvider` and `ocrProvider` under `[tenants.ai]` when AI features are enabled

## Common built-ins

- repositories: `inmem`, `flat_file`, `mongodb`, `sqlite`, `postgres`
- storage: `inmem`, `flat_file`, `google_drive`, `s3`
- embeddings: deterministic and provider-backed adapters (for example Gemini)
- OCR: null/text and provider-backed OCR adapters

Google Drive note:

- `google_drive/google_drive_storage_provider.ts` expects a Google service account JSON key plus a
  **Shared Drive ID**
- the adapter is Shared Drive-only; normal My Drive folder IDs are not supported
- see `docs/google-drive.md` for setup steps

## Validation scripts

Use these tasks to run adapter contract checks:

```bash
deno task test-node-repository
deno task test-storage-provider
```

These tasks execute contract suites using the configured runner scripts in `src/adapters/`.
