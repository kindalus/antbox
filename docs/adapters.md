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
storage = ["flat_file/flat_file_storage_provider.ts", "/var/lib/antbox/storage"]
```

Persistence of nodes, configuration, and events uses a single `database` entry instead, described
below.

Rules:

- Relative-style adapter names (no `./` and no URL) are resolved under `src/adapters/`.
- Paths beginning with `./` are loaded as explicit module paths.
- URLs can also be used for remote modules.
- Adapters outside the project cannot use project aliases such as `domain/*` or `shared/*`. They
  must import Antbox code with relative or absolute paths.

## Database

Nodes, configuration (users, groups, features, agents, workflows), and the audit event store always
live in the same backend, so a tenant declares them with one `database = [kind, ...params]` entry.
Each of the three repositories of that backend receives exactly the parameters shown:

```toml
database = ["postgres", "postgres://user:pass@localhost:5432/antbox"] # string optional: DATABASE_URL
database = ["sqlite", "./data"]  # nodes.db, config.db, events.db in ./data; no folder: in memory
database = ["mongodb", "mongodb://localhost:27017", "antbox"]
database = ["inmem"]
```

Valid kinds are `postgres`, `sqlite`, `mongodb`, and `inmem`. `flat_file` exists only as a storage
provider, not as a database kind. Relative SQLite folders resolve from the data directory.
There is no way to mix backends within one tenant. The old `repository`, `configurationRepository`,
and `eventStoreRepository` keys are rejected at startup.

## Core adapter slots

Per tenant, the main settings are:

- `database` - nodes, configuration, and event store persistence
- `storage` - file blob storage (`StorageProvider`)
- `embeddingProvider` and `ocrProvider` under `[tenants.ai]` when AI features are enabled

## Common built-ins

- database: `postgres`, `sqlite`, `mongodb`, `inmem`
- storage: `inmem`, `flat_file`, `google_drive`, `s3`
- embeddings: deterministic and provider-backed adapters (for example Gemini)
- OCR: null/text and provider-backed OCR adapters

Google Drive note:

- `google_drive/google_drive_storage_provider.ts` expects a Google service account JSON key plus a
  **Shared Drive ID**
- the adapter is Shared Drive-only; normal My Drive folder IDs are not supported
- see `docs/google-drive.md` for setup steps

## Migrating from separate repository entries

Replace the three keys with one `database` entry:

```toml
# before
repository = ["sqlite/sqlite_node_repository.ts", "./data/repository"]
configurationRepository = ["sqlite/sqlite_configuration_repository.ts", "./data/config"]
eventStoreRepository = ["sqlite/sqlite_event_store_repository.ts", "./data/events"]

# after
database = ["sqlite", "./data"]
```

SQLite files now share one folder. Stop Antbox and move them before starting, otherwise it would
open empty databases (Antbox refuses to start and prints these moves if it finds the old layout):

```sh
mv ./data/repository/nodes.db* ./data/
mv ./data/config/config.db* ./data/
mv ./data/events/events.db* ./data/
```

The `*` also moves the `-wal` and `-shm` files next to each database.

Nothing is moved automatically.

The `flat_file` node and event repositories were removed. Tenants that used them must migrate their
data to one of the database kinds above with a release that still ships those adapters, because the
current code cannot read that data.

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

## Remaining adapter limits

- MongoDB vector search loads every node with an embedding and calculates similarity in the
  application. `topK` limits the returned results, not the scan or transfer; memory and query cost
  grow with the embedded collection.
- SQLite, PostgreSQL, and MongoDB event stores replace MIME-type punctuation with underscores in
  table or collection names. For example, `application/x+a` and `application/x-a` share a namespace.
  These naming formats need a migration to preserve distinct MIME types; existing event names are
  not rewritten automatically.

## Validation scripts

Use these tasks to run adapter contract checks:

```bash
bun run test-node-repository
bun run test-storage-provider
```

These tasks execute contract suites using the configured runner scripts in `src/adapters/`.
