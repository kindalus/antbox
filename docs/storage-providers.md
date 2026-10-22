---
name: storage-providers
description: Storage providers documentation
---

# Storage Providers

Storage providers store the binary content of file nodes. Metadata is stored separately in a
`NodeRepository`, so a complete tenant setup typically configures **both** a repository and a
storage provider.

## Configuration Format

Adapters are configured using module arrays in `config.toml`:

```toml
[[tenants]]
name = "default"

repository = ["inmem/inmem_node_repository.ts"]
storage = ["inmem/inmem_storage_provider.ts"]
eventStoreRepository = ["inmem/inmem_event_store_repository.ts"]
```

Each array is `[modulePath, ...params]`. If the path does not start with `./` or `http`, it is
resolved under the `adapters/` import (mapped to `src/adapters/`).

## Built-in Storage Providers

### In-memory

```toml
storage = ["inmem/inmem_storage_provider.ts"]
```

### Flat file (local disk)

```toml
storage = ["flat_file/flat_file_storage_provider.ts", "/path/to/storage"]
```

Content overwrites use a temporary file and atomic rename, so a failed content write preserves the
previous bytes. MIME types remain in separate `.mimetype` files for compatibility. If updating that
sidecar fails after the content rename, the operation returns an error but the new bytes are already
stored; the previous MIME type may remain. Treat this as a partial update, not a rollback. Keep
backups of the storage directory and use one application process per directory.

### Google Drive

Antbox supports **Google Shared Drives only** for the Google Drive adapter. The configured Google
target is the **Shared Drive ID**, not a folder ID. Antbox writes top-level nodes directly under the
Shared Drive root.

```toml
storage = [
  "google_drive/google_drive_storage_provider.ts",
  "/path/to/service-account.json",
  "<shared-drive-id>"
]
```

See `docs/google-drive.md` for the required Google Cloud / Google Workspace setup steps.

### S3

```toml
storage = ["s3/s3_storage_provider.ts", "/path/to/s3-config.json"]
```

Example `s3-config.json`:

```json
{
	"region": "us-east-1",
	"endpoint": "https://s3.amazonaws.com",
	"bucket": "my-bucket",
	"credentials": {
		"accessKeyId": "...",
		"secretAccessKey": "..."
	}
}
```

Uploads preserve the requested MIME type, and reads report transport and object-stream failures.
Deletes send a direct request without downloading the object. Deleting an already absent object can
succeed, following the
[S3 DeleteObject API](https://docs.aws.amazon.com/AmazonS3/latest/API/API_DeleteObject.html).
Permission, missing-bucket, and network failures return errors so node metadata is retained.

## Related Adapters

- **Repositories**: `inmem`, `flat_file`, `sqlite`, `postgres`, `mongodb`
- **AI retrieval**: configure `[tenants.ai]` with an `embeddingProvider`; semantic search also
  requires a repository that supports embeddings

See `docs/architecture.md` for a broader overview of adapters.
