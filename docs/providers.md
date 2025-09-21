# Antbox Storage and Persistence Providers

Antbox is a flexible ECM system that separates content storage from metadata persistence through two key abstractions: **Storage Providers** (for binary content) and **Node Repositories** (for metadata and relationships). This pluggable architecture allows you to choose the best backend for your specific needs.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Configuration](#configuration)
- [Available Storage Providers](#available-storage-providers)
- [Available Node Repositories](#available-node-repositories)
- [Provider Interfaces](#provider-interfaces)
- [Configuration Examples](#configuration-examples)
- [Creating Custom Providers](#creating-custom-providers)

## Architecture Overview

Antbox uses a dual-provider architecture:

- **Storage Providers**: Handle binary content (files, documents, media)
- **Node Repositories**: Handle metadata, relationships, and structured data

This separation allows optimal storage choices - for example, using S3 for content with MongoDB for metadata, or local files with PouchDB for offline-first scenarios.

## Configuration

Providers are configured during server setup using the `setupTenants` function:

```typescript
import { setupTenants } from "setup/setup_tenants.ts";

const tenants = await setupTenants({
  tenants: [
    {
      name: "production",
      rootPasswd: "secure_password",
      storage: ["s3/s3_storage_provider.ts", "/path/to/s3_config.json"],
      repository: [
        "mongodb/mongodb_node_repository.ts",
        "mongodb://localhost:27017/antbox",
      ],
    },
  ],
});
```

Providers are referenced by their module path relative to `src/adapters/` or as fully qualified file paths.

## Available Storage Providers

Storage providers handle binary content storage and retrieval.

### 1. Flat File Storage Provider

- **Path**: `flat_file/flat_file_storage_provider.ts`
- **Description**: Stores files directly on the file system
- **Best for**: Development, small deployments, local installations
- **Configuration**: Directory path for storage

```typescript
{
  storage: ["flat_file/flat_file_storage_provider.ts", "/data/storage"];
}
```

### 2. In-Memory Storage Provider

- **Path**: `inmem/inmem_storage_provider.ts`
- **Description**: Volatile storage in system memory
- **Best for**: Testing, development, temporary data
- **Configuration**: No parameters required

```typescript
{
  storage: ["inmem/inmem_storage_provider.ts"];
}
```

### 3. Null Storage Provider

- **Path**: `null/null_storage_provider.ts`
- **Description**: Discards all content (no-op storage)
- **Best for**: Testing, metadata-only scenarios
- **Configuration**: No parameters required

```typescript
{
  storage: ["null/null_storage_provider.ts"];
}
```

### 4. S3 Storage Provider

- **Path**: `s3/s3_storage_provider.ts`
- **Description**: Amazon S3 and S3-compatible object storage
- **Best for**: Production, scalability, cloud deployments
- **Configuration**: S3 configuration JSON file

```typescript
{
  storage: ["s3/s3_storage_provider.ts", "/path/to/s3_config.json"];
}
```

#### S3 Configuration File

```json
{
  "forcePathStyle": false,
  "endpoint": "s3.amazonaws.com",
  "region": "us-east-1",
  "bucket": "antbox-storage",
  "credentials": {
    "accessKeyId": "AKIAIOSFODNN7EXAMPLE",
    "secretAccessKey": "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
  }
}
```

### 5. Google Drive Storage Provider

- **Path**: `google_drive/google_drive_storage_provider.ts`
- **Description**: Google Drive cloud storage integration
- **Best for**: Cloud storage, collaboration, accessibility
- **Configuration**: Service account credentials and folder ID

```typescript
{
  storage: [
    "google_drive/google_drive_storage_provider.ts",
    "/path/to/service_account.json",
    "google_drive_folder_id",
  ];
}
```

⚠️ **Note**: Google Drive integration requires service account setup and may have compatibility issues with newer Deno versions.

## Available Node Repositories

Node repositories handle metadata, relationships, and structured data persistence.

### 1. In-Memory Node Repository

- **Path**: `inmem/inmem_node_repository.ts`
- **Description**: Volatile metadata storage in system memory
- **Best for**: Development, testing, temporary data
- **Configuration**: No parameters required

```typescript
{
  repository: ["inmem/inmem_node_repository.ts"];
}
```

### 2. Flat File Node Repository

- **Path**: `flat_file/flat_file_node_repository.ts`
- **Description**: JSON file-based metadata storage (`nodes_repo.json`)
- **Best for**: Development, small deployments, simple setups
- **Configuration**: Directory path for repository files

```typescript
{
  repository: ["flat_file/flat_file_node_repository.ts", "/data/repository"];
}
```

### 3. PouchDB Node Repository

- **Path**: `pouchdb/pouchdb_node_repository.ts`
- **Description**: Offline-first document database with CouchDB compatibility
- **Best for**: Offline scenarios, synchronization, distributed deployments
- **Configuration**: Database path or URL

```typescript
{
  repository: ["pouchdb/pouchdb_node_repository.ts", "/data/pouchdb"];
}
```

⚠️ **Limitation**: May not work on ARM macOS due to native dependencies.

### 4. MongoDB Node Repository

- **Path**: `mongodb/mongodb_node_repository.ts`
- **Description**: Scalable NoSQL document database
- **Best for**: Production, large datasets, complex queries
- **Configuration**: MongoDB connection string

```typescript
{
  repository: [
    "mongodb/mongodb_node_repository.ts",
    "mongodb://localhost:27017/antbox",
  ];
}
```

## Provider Interfaces

Antbox defines clear interfaces for custom provider implementation:

### StorageProvider Interface

```typescript
interface StorageProvider {
  write(uuid: string, content: Uint8Array): Promise<void>;
  read(uuid: string): Promise<Uint8Array>;
  exists(uuid: string): Promise<boolean>;
  delete(uuid: string): Promise<void>;
}
```

### NodeRepository Interface

```typescript
interface NodeRepository {
  add(node: NodeLike): Promise<Either<AntboxError, void>>;
  update(
    uuid: string,
    metadata: Partial<NodeMetadata>,
  ): Promise<Either<AntboxError, void>>;
  delete(uuid: string): Promise<Either<AntboxError, void>>;
  get(uuid: string): Promise<Either<NodeNotFoundError, NodeLike>>;
  find(
    filters: NodeFilters,
    limit?: number,
    offset?: number,
  ): Promise<NodeFilterResult>;
}
```

## Configuration Examples

### Development Setup (In-Memory)

Perfect for development and testing:

```typescript
{
  name: "dev",
  rootPasswd: "dev123",
  storage: ["inmem/inmem_storage_provider.ts"],
  repository: ["inmem/inmem_node_repository.ts"]
}
```

### Local File Setup

Good for small deployments:

```typescript
{
  name: "local",
  rootPasswd: "secure_password",
  storage: ["flat_file/flat_file_storage_provider.ts", "/data/storage"],
  repository: ["flat_file/flat_file_node_repository.ts", "/data/repository"]
}
```

### Production Setup

Scalable production configuration:

```typescript
{
  name: "production",
  rootPasswd: "very_secure_password",
  storage: ["s3/s3_storage_provider.ts", "/config/s3_config.json"],
  repository: ["mongodb/mongodb_node_repository.ts", "mongodb://cluster.mongodb.net/antbox?retryWrites=true&w=majority"]
}
```

### Hybrid Setup

MongoDB for metadata, local storage for content:

```typescript
{
  name: "hybrid",
  rootPasswd: "secure_password",
  storage: ["flat_file/flat_file_storage_provider.ts", "/data/content"],
  repository: ["mongodb/mongodb_node_repository.ts", "mongodb://localhost:27017/antbox"]
}
```

## Creating Custom Providers

### Custom Storage Provider Example

```typescript
import { Either, left, right } from "shared/either.ts";
import { AntboxError } from "shared/antbox_error.ts";
import { StorageProvider } from "application/storage_provider.ts";

export default function buildMyCustomStorage(
  config: string,
): Promise<Either<AntboxError, StorageProvider>> {
  return Promise.resolve(right(new MyCustomStorageProvider(config)));
}

class MyCustomStorageProvider implements StorageProvider {
  constructor(private config: string) {}

  async write(uuid: string, content: Uint8Array): Promise<void> {
    // Custom implementation
  }

  async read(uuid: string): Promise<Uint8Array> {
    // Custom implementation
  }

  async exists(uuid: string): Promise<boolean> {
    // Custom implementation
  }

  async delete(uuid: string): Promise<void> {
    // Custom implementation
  }
}
```

### Custom Repository Provider Example

```typescript
import { Either, left, right } from "shared/either.ts";
import { AntboxError } from "shared/antbox_error.ts";
import {
  NodeRepository,
  NodeFilterResult,
} from "domain/nodes/node_repository.ts";

export default function buildMyCustomRepository(
  connectionString: string,
): Promise<Either<AntboxError, NodeRepository>> {
  return Promise.resolve(right(new MyCustomRepository(connectionString)));
}

class MyCustomRepository implements NodeRepository {
  constructor(private connectionString: string) {}

  async add(node: NodeLike): Promise<Either<AntboxError, void>> {
    // Custom implementation
  }

  // ... implement other required methods
}
```

## Best Practices

1. **Choose appropriate providers**: Match providers to your deployment needs
2. **Consider data locality**: Keep related data geographically close
3. **Plan for scalability**: Use scalable backends for production
4. **Backup strategies**: Ensure your chosen providers support your backup needs
5. **Performance testing**: Test provider performance under your expected load
6. **Security**: Configure proper access controls and encryption
7. **Monitoring**: Set up monitoring for your chosen backends

---

Antbox's pluggable provider architecture ensures you can adapt the system to your specific infrastructure requirements while maintaining consistent functionality across different deployment scenarios.
