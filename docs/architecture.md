---
name: architecture
description: System architecture overview
---

# Architecture

Antbox is built with a Hexagonal (Ports and Adapters) architecture. Core business rules live in the
Domain and Application layers, while integrations (HTTP servers, storage, databases, AI providers)
are isolated in Adapters. This keeps the system modular and swap-friendly.

The system is also multi-tenant. Each tenant is assembled at startup with its own repositories,
storage provider, keys, and optional AI components.

```
+---------------------------------------------------------------------------------------+
|                                       Adapters                                        |
|  HTTP (oak) | WebDAV | Storage (inmem/flat_file/gdrive/s3) | Repos (inmem/flat_file/sqlite/postgres/mongodb) |
|  AI/OCR/Embeddings Providers | External JWKS | Docs/OpenAPI                             |
+----------------------------------^--------------------^-------------------------------+
                                    |                    |
                                    v                    v
+---------------------------------------------------------------------------------------+
|                                     Application                                       |
|  NodeService | AspectsService | FeaturesService/Engine | AgentsService/Engine         |
|  Workflows | Users/Groups/API Keys | Audit Logging | RAG/Embedding                     |
+----------------------------------^--------------------^-------------------------------+
                                   |                    |
                                   v                    v
+---------------------------------------------------------------------------------------+
|                                        Domain                                         |
|  Nodes | Aspects | Features | Agents | Workflows | Users/Groups | Audit Events          |
+---------------------------------------------------------------------------------------+
```

## Key Data Stores

- **NodeRepository**: Metadata for content nodes (files, folders, smart folders, meta nodes,
  articles).
- **StorageProvider**: Binary file content for file nodes.
- **ConfigurationRepository**: Aspects, features, agents, workflows, users, groups, and API keys.
- **EventStoreRepository**: Audit event streams (required per tenant).

Configuration repositories can be backed by in-memory or persistent adapters depending on tenant
configuration.

## Ports and Adapters

The domain and application layers define ports such as `StorageProvider`, `NodeRepository`,
`EmbeddingsProvider`, `OCRProvider`, and AI model abstractions. Adapters implement these ports and
are loaded dynamically from module paths configured in `config.toml`.

## Execution Engines

Execution engines orchestrate dynamic behavior:

- **FeaturesEngine**: Runs actions, extensions, and AI tools (feature modules).
- **AgentsEngine**: Runs chat/answer flows and tool-calling with configured AI models.
- **WorkflowInstancesEngine**: Applies workflow transitions and controls edits to workflow-owned
  nodes. Workflow services store definitions and instance state.

This setup makes it easy to swap adapters (storage, repositories, AI models) without changing core
business logic.

## Consistency boundaries

Node metadata, file content, configuration, and audit events use separate repositories. They do not
share a transaction. Workflow operations attempt to restore instance state when a node write fails;
see [workflow recovery behavior](./workflows.md#access-and-behavior). Local queues serialize
workflow operations and finite storage-quota writes within one server process. They do not
coordinate multiple server processes.

Configuration saves, administrative configuration reads, and manual reloads share a queue for each
configuration directory. Saves hold that queue through reload or rollback, so a failed update cannot
erase a later successful update. This queue coordinates one process; direct file edits and other
server processes need external coordination.

HTTP requests keep the tenant service instances selected at authentication, even when configuration
reload replaces the tenant registry. Requests already in progress finish against those instances.
Successful reloads do not yet drain and close replaced providers; repeated reloads can retain their
connections. Provider draining needs a separate lifecycle change.

Parent-folder event handling uses `NodeRepository.touch(uuid)` to update only `modifiedTime`. Custom
node adapters must implement this operation without replacing metadata read earlier, and must return
an error for a missing node. A read followed by `update(node)` can overwrite a concurrent rename or
permission change.

In-memory node and configuration repositories copy values on writes and reads. Built-in
configuration records also return detached copies. Changing a returned object does not change
persisted records or another tenant's built-in configuration; changes must go through the service's
write operations.

Feature code and AI code tools still execute without a dedicated sandbox. Automatic features and
`runAs` also need a stricter privilege model. Treat code and feature configuration as trusted
administrative inputs until those boundaries are implemented.
