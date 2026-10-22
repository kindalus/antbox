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

## Existing repository data

### PostgreSQL JSON values

Earlier PostgreSQL adapters could save JSON objects as JSON strings in `nodes.body`,
`config_*.body`, and `events_*.payload`. Updated adapters write objects correctly. Startup does not
rewrite existing rows.

Before upgrading an existing PostgreSQL tenant, back up its database and inspect each populated
table. For example:

```sql
SELECT jsonb_typeof(body), count(*) FROM nodes GROUP BY 1;
SELECT uuid, (body #>> '{}')::jsonb AS decoded_body
FROM nodes WHERE jsonb_typeof(body) = 'string' LIMIT 20;
```

Valid node and configuration bodies must decode to objects. Event payloads must decode to the stored
event envelope, including `eventType`, `userEmail`, `occurredOn`, and `payload`. A failed cast means
the row needs individual investigation. Test repairs on a restored backup first, with tenant writes
stopped, and process a reviewed batch at a time:

```sql
BEGIN;
WITH batch AS (
    SELECT uuid FROM nodes
    WHERE jsonb_typeof(body) = 'string'
    ORDER BY uuid LIMIT 1000
    FOR UPDATE
)
UPDATE nodes SET body = (body #>> '{}')::jsonb
FROM batch WHERE nodes.uuid = batch.uuid
RETURNING nodes.uuid, jsonb_typeof(body);
ROLLBACK;
```

The example rolls back for review. Commit only a verified batch whose decoded values are objects.
Use the same conversion for configuration bodies; event tables use `payload` and the composite key
`(stream_id, sequence)`. After repair, verify node reads and filters, configuration reads, and audit
streams. Keep the backup until verification is complete.

### MongoDB node identifiers

New MongoDB nodes use the complete UUID string as `_id`. Existing ObjectId records remain readable,
updatable, and deletable through their stored `uuid`, so no ID rewrite is required. Initialization
creates a unique `uuid` index. Duplicate UUIDs, including multiple documents without a UUID, prevent
index creation. Review and repair those records before starting the adapter; initialization does not
discard them.

### Flat-file audit streams

Audit stream writes replace their JSON file atomically before updating the in-memory stream. A
failed write leaves the previous stream intact. Startup now fails when an existing stream cannot be
read, parsed, or validated as audit events, preserving that file for repair instead of silently
skipping its history. Historical extra event fields remain intact. Restore a verified backup or
repair the affected file before restarting the tenant. Flat-file repositories are intended for a
single process; use a database adapter for concurrent application instances.

## Remaining adapter limits

- The flat-file node repository keeps embeddings and their Markdown content only in memory. Node
  metadata survives restart, but embeddings must be regenerated before semantic search can return
  those nodes again.
- MongoDB vector search loads every node with an embedding and calculates similarity in the
  application. `topK` limits the returned results, not the scan or transfer; memory and query cost
  grow with the embedded collection.
- SQLite, PostgreSQL, and MongoDB event stores replace MIME-type punctuation with underscores in
  table or collection names. For example, `application/x+a` and `application/x-a` share a namespace.
  Flat-file event directories replace `/` with `_` and decode every `_` as `/`, so MIME types
  containing underscores reload under a different key. These naming formats need a migration to
  preserve distinct MIME types; existing event names are not rewritten automatically.

## Validation scripts

Use these tasks to run adapter contract checks:

```bash
deno task test-node-repository
deno task test-storage-provider
```

These tasks execute contract suites using the configured runner scripts in `src/adapters/`.
