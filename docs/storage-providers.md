# Storage Providers

Storage providers store the binary content of file nodes. Metadata is stored separately in a
`NodeRepository`, so a complete tenant setup typically configures **both** a repository and a
storage provider.

## Configuration Format

Adapters are configured using module arrays in `antbox.toml`:

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

### Google Drive

```toml
storage = [
  "google_drive/google_drive_storage_provider.ts",
  "/path/to/service-account.json",
  "<google-drive-root-folder-id>"
]
```

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

## Related Adapters

- **Repositories**: `inmem`, `flat_file`, `mongodb`, `pouchdb`
- **Vector databases** (for AI): `inmem`, `flat_file`

See `docs/architecture.md` for a broader overview of adapters.
