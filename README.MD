# Antbox

Antbox is a feature-centric ECM (Enterprise Content Management) platform designed to provide powerful solutions for content storage, retrieval, and dynamic functionality. Built with Deno and TypeScript, it offers a flexible architecture where **Features** serve as the core building blocks for automation, content processing, and system extensibility.

## Core Concepts

### Features - The Heart of Antbox

Features are JavaScript/TypeScript functions that can be exposed in multiple ways:

- **Actions**: Automated behaviors triggered by node creation, updates, or manual execution
- **Extensions**: HTTP-accessible endpoints for custom functionality
- **MCP Tools**: Model Context Protocol compatible tools for AI integration

### Node-Based Architecture

Everything in Antbox is represented as a **Node** with rich metadata and extensible properties:

- **File Nodes**: Documents, images, and other files with content
- **Folder Nodes**: Hierarchical organization with permission-based security
- **Smart Folder Nodes**: Dynamic content aggregation based on filters
- **Meta Nodes**: Auxiliary entities for organization and categorization
- **Aspect Nodes**: Schema definitions for extending node properties
- **User/Group Nodes**: Identity and access management
- **Article Nodes**: Rich text content with markdown support
- **API Key Nodes**: Programmatic access credentials

## Key Features

- **Multi-tenancy**: Efficiently manage multiple tenants within a single instance
- **Dynamic Extensibility**: Add custom functionality through JavaScript Features
- **Flexible Node System**: Extensible content types through Aspects
- **Hierarchical Security**: Folder-based access control with fine-grained permissions
- **Multiple Storage Backends**: File system, S3, Google Drive, MongoDB, PouchDB
- **RESTful API**: Complete HTTP API for all operations
- **Feature-Centric Architecture**: Unified approach to actions, extensions, and tools

## Installation & Deployment

Antbox offers multiple deployment modes to suit different requirements:

### Quick Start - Sandbox Mode

Run a completely in-memory server for development and testing:

```shell
deno run --allow-net --allow-read src/sandbox.ts
```

### Persistent Demo Server

Set up a server with PouchDB and flat file storage:

```shell
deno run --allow-read --allow-write --allow-net src/demo.ts [data_dir]
```

For more options:

```shell
deno run --allow-read --allow-write --allow-net src/demo.ts --help
```

### Docker Deployment

Antbox is available as a Docker image for easy containerized deployment:

```shell
docker pull kindalus/antbox:latest
docker run -p 7180:7180 -v /host/data:/data kindalus/antbox:latest
```

### Custom Configuration

For production deployments, you can configure Antbox with various storage and repository providers:

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

## Features in Action

### Creating a Custom Feature

Features are JavaScript modules that can process content, integrate with external services, or provide custom business logic:

```typescript
// my-feature.ts
export default async function (context, params) {
  // Access node service for content operations
  const { nodeService } = context;

  // Custom logic here
  const result = await nodeService.find({
    filters: [{ property: "mimetype", value: "text/plain" }],
  });

  return { processed: result.length };
}
```

### Exposing Features

Features can be exposed in multiple ways:

1. **As Actions**: Automatically triggered on node operations
2. **As Extensions**: HTTP endpoints accessible via `/ext/{feature-uuid}`
3. **As MCP Tools**: AI-compatible tools for model interactions

## Storage & Repository Providers

Antbox supports multiple backends through a pluggable architecture:

### Storage Providers

- **Flat File**: Local file system storage
- **S3**: Amazon S3 and compatible services
- **Google Drive**: Cloud storage integration
- **In-Memory**: Volatile storage for development

### Repository Providers

- **PouchDB/CouchDB**: Offline-first document database
- **MongoDB**: Scalable NoSQL database
- **Flat File**: JSON-based file storage
- **In-Memory**: Volatile storage for testing

## Security & Access Control

- **JWT-based Authentication**: Secure token-based access
- **Multi-tenant Isolation**: Complete separation between tenants
- **Hierarchical Permissions**: Folder-level access control
- **Role-based Access**: User groups with specific permissions
- **API Key Management**: Programmatic access control

## API & Integration

Antbox provides a comprehensive REST API covering:

- **Nodes API**: CRUD operations for all node types
- **Features API**: Management and execution of features
- **Aspects API**: Schema definition and management
- **Authentication API**: Login and token management
- **Extensions API**: Direct feature execution via HTTP

## Documentation

For detailed information about specific topics:

- [Architecture Overview](./docs/architecture.md)
- [Understanding Nodes and Aspects](./docs/undestanding_node_and_aspects.md)
- [Features, Actions & Extensions](./docs/actions.md)
- [Storage and Persistence Providers](./docs/providers.md)
- [Security Model](./docs/security.md)
- [Extensions Development](./docs/ext.md)
- [REST API Reference](./docs/api.md)
- [Tools and Utilities](./docs/tools.md)

## Contributing

We welcome contributions to the Antbox project. Please read our contributing guidelines for information on how to get started.

## License

Antbox is licensed under the MIT License. See LICENSE file for details.

---

**Antbox** - Where content meets intelligent automation through feature-driven architecture.
