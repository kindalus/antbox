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

### Full-text search

Each node repository keeps a full-text index of the node's searchable metadata and extracted body
next to the node, and runs `fulltext match` with the database's own engine. See
[Full-text search](node-querying.md#full-text-search) for the matching rules of each database.

- **SQLite:** an FTS5 table (`nodes_fts`, tokenizer `unicode61 remove_diacritics 2`) over
  `nodes_search`, kept in step by triggers. Deleting a node deletes its search row. Each query word
  becomes a quoted prefix phrase; ranking is `bm25` with the metadata weighted 10 and the body 1.
- **PostgreSQL:** `search_meta` and `search_body` columns feed a generated `search_vector` with a
  GIN index. Startup runs `CREATE EXTENSION IF NOT EXISTS unaccent` and creates the `antbox_pt`
  text search configuration (Portuguese with `unaccent` before the stemmer). The database user needs
  permission to create the extension, or an administrator must create it first; otherwise a warning
  is logged and the plain `portuguese` configuration is used, so accents must match. A column keeps
  the configuration it was created with; to switch, drop `search_vector` and restart. The query
  text goes through the same configuration, and each word becomes a required prefix term.
  Ranking is `ts_rank_cd` with the metadata weighted 1.0 and the body 0.1.
- **MongoDB:** a text index `nodes_fts` on `searchMeta` (weight 10) and `searchBody` (weight 1) with
  `default_language: "portuguese"` and `language_override: "_ftsLanguage"`, so a node field called
  `language` does not change the index language. MongoDB allows one text index per collection.
  Each query word is sent as a quoted phrase, which makes every word required; there is no prefix
  matching.
- **In-memory:** keeps the earlier `match` behaviour on the cleaned metadata and body: words in
  order, anywhere inside words, accents and words shorter than three letters ignored. No ranking.

On startup each tenant indexes, in the background and without AI, the nodes that have no search
metadata yet. The markdown is rebuilt from the current metadata and the body already stored, and
that body becomes searchable. Running again only handles what is missing. The legacy `fulltext`
value stays in each node's stored JSON, ignored, so an older version still finds those nodes after
a rollback; a node saved by this version no longer carries it (MongoDB keeps it).

## Remaining adapter limits

- MongoDB vector search loads every node with an embedding that passes the permission filter and
  calculates similarity in the application; only the content of the returned `topK` is read.
  Memory and query cost grow with the embedded collection. Atlas `$vectorSearch` is not used.
- SQLite vector search needs the `sqlite-vec` extension, installed from npm with a binary per
  platform (`sqlite-vec-linux-x64`, `-linux-arm64`, `-darwin-x64`, `-darwin-arm64`,
  `-windows-x64`). The repository fails to start when the binary cannot be loaded. Embeddings are
  stored as float32 BLOBs; JSON embeddings written by earlier versions are converted on startup.
  Search compares every embedded node that passes the filters (no vec0 index), so permissions
  apply before the `topK` cut.
- PostgreSQL vector search sets `hnsw.ef_search` to the requested `topK` (at most 1000). With
  pgvector 0.8 or later it uses `hnsw.iterative_scan` for filtered searches and falls back to an
  exact scan when that returns fewer than `topK` rows; earlier versions always use an exact scan for
  filtered searches.
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
